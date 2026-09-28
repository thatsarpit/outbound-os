/**
 * What connecting an AI client to the CRM actually looks like.
 *
 * MCP is the hardest thing on this site to convey in prose, because "your
 * assistant can query the CRM" sounds either obvious or like science fiction
 * depending on the reader. Showing one real exchange — the question, the tool
 * the agent reaches for, the data that comes back — settles it in a glance.
 *
 * The tool names are the ones the MCP server actually exposes, so this is a
 * depiction of the real surface rather than an imagined one.
 */

export function AgentExchange({ className }: { className?: string }) {
  return (
    <div className={['agent', className].filter(Boolean).join(' ')} aria-hidden="true">
      <div className="ui__bar">
        <span className="ui__dots"><i /><i /><i /></span>
        <span className="ui__title">Claude &middot; connected to Outbound OS</span>
        <span className="badge badge--live agent__badge">
          <span className="badge__dot" />
          MCP
        </span>
      </div>

      <div className="agent__thread">
        <p className="agent__msg agent__msg--user">
          Which deals went quiet this week?
        </p>

        {/* The tool call is the point. It shows the agent is reading live data
            rather than guessing, which is the whole claim. */}
        <div className="agent__call">
          <span className="agent__call-label">Calling</span>
          <code className="mono">list_leads</code>
          <span className="agent__call-args mono">status=contacted, engagement=none, sortBy=lastMessageAt</span>
        </div>

        <div className="agent__msg agent__msg--agent">
          <p>Four have gone quiet since Monday:</p>
          <ul className="agent__list">
            <li>
              <span className="agent__lead">Meridian Distributors</span>
              <span className="agent__meta tabular">quoted 6d ago &middot; &#8377;4.2L</span>
            </li>
            <li>
              <span className="agent__lead">Adler Handel GmbH</span>
              <span className="agent__meta tabular">quoted 7d ago &middot; &euro;18k</span>
            </li>
            <li>
              <span className="agent__lead">Lagos Medical Supply</span>
              <span className="agent__meta tabular">quoted 8d ago &middot; $9.4k</span>
            </li>
            <li>
              <span className="agent__lead">Northwind Pharma</span>
              <span className="agent__meta tabular">quoted 9d ago &middot; $22k</span>
            </li>
          </ul>
          <p className="agent__followup">
            Want me to create a draft follow-up campaign for these four?
          </p>
        </div>
      </div>
    </div>
  )
}
