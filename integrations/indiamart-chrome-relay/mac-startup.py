#!/usr/bin/env python3
"""Optional, owner-run Chrome startup helper. Never reads browser credentials."""
import argparse, os, pathlib, plistlib, re, subprocess
LABEL='com.outboundos.indiamart-chrome-relay'
def make_plist(profile):
    if not re.fullmatch(r'Default|Profile \d+',profile):
        raise ValueError('Use the last folder in chrome://version → Profile Path, such as Default or Profile 1.')
    return {'Label':LABEL,'ProgramArguments':['/usr/bin/open','-g','-j','-a','Google Chrome','--args','--profile-directory='+profile,'--no-startup-window'],
            'RunAtLoad':True,'StartInterval':900,'ProcessType':'Background'}
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['install','remove','check'])
    parser.add_argument('--profile',default='Default')
    args=parser.parse_args()
    target=pathlib.Path.home()/'Library/LaunchAgents'/(LABEL+'.plist')
    domain='gui/'+str(os.getuid())
    if args.action=='check':
        plistlib.loads(plistlib.dumps(make_plist(args.profile)));print('Startup configuration validated; nothing installed.');return
    if args.action=='remove':
        subprocess.run(['launchctl','bootout',domain,str(target)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        target.unlink(missing_ok=True);print('Chrome startup helper removed.');return
    config=make_plist(args.profile)
    target.parent.mkdir(exist_ok=True)
    subprocess.run(['launchctl','bootout',domain,str(target)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    target.write_bytes(plistlib.dumps(config));target.chmod(0o600)
    subprocess.run(['launchctl','bootstrap',domain,str(target)],check=True)
    print('Startup helper installed. Chrome starts quietly at login and is checked every 15 minutes while the Mac is awake.')
    print('To remove it: python3 '+str(pathlib.Path(__file__).resolve())+' remove')
if __name__=='__main__':main()
