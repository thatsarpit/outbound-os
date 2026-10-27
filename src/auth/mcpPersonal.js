import { randomUUID, timingSafeEqual } from 'node:crypto';
import prisma from '../utils/prismaClient.js';
import { appRoleFromOrgRole } from '../../shared/clerkRoles.js';
import { McpAuthorization, personalMcpConfig, prismaMcpRepository } from '../services/mcpAuthorization.js';
import logger from '../utils/logger.js';
import { markVerifiedMcpActor } from './verifiedMcpActor.js';

let service;
const verifiedActor = Symbol('verifiedMcpActor');
export function getPersonalMcpService() {
  const config = personalMcpConfig();
  if (!config) return null;
  service ??= new McpAuthorization({ config, repository: prismaMcpRepository(prisma), resolvePerson });
  return service;
}

async function resolvePerson(owner) {
  const provider = (process.env.AUTH_PROVIDER || (process.env.CLERK_SECRET_KEY ? 'clerk' : 'local')).toLowerCase() === 'clerk' ? 'clerk' : 'local';
  if (owner.provider !== provider) return null;
  if (provider === 'local') {
    if (owner.orgId !== 'local' || !/^[1-9]\d*$/.test(String(owner.id))) return null;
    const user = await prisma.user.findUnique({ where: { id: Number(owner.id) } });
    return user && user.enabled && user.role === 'admin'
      ? { id: String(user.id), orgId: 'local', provider, workspace: owner.workspace, role: user.role, name: user.name, email: user.email }
      : null;
  }
  // Session claims can outlive a removed membership. Personal MCP grants use a
  // live Clerk membership lookup on every approval, refresh and API operation.
  const orgId = String(process.env.CLERK_ORGANIZATION_ID || '').trim();
  if (!orgId || owner.orgId !== orgId) return null;
  const { clerkClient } = await import('@clerk/express');
  const [memberships, user] = await Promise.all([
    clerkClient.organizations.getOrganizationMembershipList({ organizationId: orgId, userId: [String(owner.id)], limit: 2 }),
    clerkClient.users.getUser(String(owner.id)),
  ]);
  const membership = memberships.data.find(item => item.publicUserData?.userId === String(owner.id));
  const role = appRoleFromOrgRole(membership?.role);
  return role === 'admin' && !user.banned && !user.locked
    ? { id: String(owner.id), orgId, provider, workspace: owner.workspace, role,
      name: [user.firstName, user.lastName].filter(Boolean).join(' '), email: user.primaryEmailAddress?.emailAddress || '' }
    : null;
}

/** This gate is additional to requireRole and never accepts a service identity. */
export function mcpPersonalOwner(req) {
  const config = personalMcpConfig();
  const user = req.user;
  if (!config || !user || user.id === 'mcp-service' || user.delegated || user.orgId === 'service') return null;
  return { id: String(user.id), orgId: user.orgId,
    provider: (process.env.AUTH_PROVIDER || (process.env.CLERK_SECRET_KEY ? 'clerk' : 'local')).toLowerCase() === 'clerk' ? 'clerk' : 'local',
    workspace: config.workspace };
}

export function personalMcpControlAuthorized(req) {
  const secret = personalMcpConfig()?.secret;
  const supplied = req.headers.authorization;
  if (!secret || typeof supplied !== 'string' || !supplied.startsWith('Bearer ')) return false;
  const a = Buffer.from(supplied.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Call before the existing service-token shortcut in BOTH requireRole implementations. */
export async function resolveMcpDelegation(req, res, next, minimumRole) {
  const bearer = req.headers.authorization;
  if (typeof bearer !== 'string' || !bearer.startsWith('Bearer mcp_delegation_')) return false;
  try {
    const current = getPersonalMcpService();
    if (!current) throw Object.assign(new Error('Personal MCP authorization is disabled.'), { status: 401 });
    const actor = req[verifiedActor]
      || await current.verifyDelegation(bearer.slice(7), req.method, (req.originalUrl || '').split('?')[0]);
    const levels = { viewer: 0, agent: 1, manager: 2, admin: 3 };
    if (!Object.hasOwn(levels, minimumRole) || levels[actor.role] < levels[minimumRole]) {
      throw Object.assign(new Error('Insufficient current workspace role.'), { status: 403 });
    }
    req.user = markVerifiedMcpActor(actor);
    if (!req[verifiedActor]) {
      req[verifiedActor] = actor;
      const correlationId = randomUUID();
      res.set('X-Mcp-Correlation-Id', correlationId);
      res.once('finish', () => {
        current.recordTool(actor, res.statusCode, correlationId)
          .catch(() => logger.error('MCP tool audit event could not be saved.'));
      });
    }
    next();
  } catch (error) {
    res.status(error.status || 503).json({ error: error.status ? error.message : 'Personal MCP authorization is temporarily unavailable.' });
  }
  return true;
}
