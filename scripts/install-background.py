"""Install the current build as a per-user, silent WPS add-in host."""
from pathlib import Path
import os, plistlib, shutil, subprocess, time, sys, uuid
from urllib.request import urlopen
from urllib.error import URLError

root=Path(__file__).resolve().parents[1]
source=root/'dist/WPS一键排版.app'
if not (source/'Contents/MacOS/WPSFormatter').exists():
    raise SystemExit('请先运行 bash scripts/build.sh')
label='local.wps.formatter.background'
domain=f'gui/{os.getuid()}'
base=Path.home()/'Library/Application Support/WPSLocalFormatter'
agent=Path.home()/'Library/LaunchAgents'/f'{label}.plist'
if not agent.exists():
    subprocess.run([sys.executable,str(root/'scripts/register-probe.py')],check=True,timeout=30)
else:
    print('更新已安装的服务，保留现有 WPS 注册。')
base.mkdir(parents=True,exist_ok=True);agent.parent.mkdir(parents=True,exist_ok=True)
# Stop only our registered service or an executable from our known app paths.
subprocess.run(['launchctl','bootout',f'{domain}/{label}'],capture_output=True)
installed=base/source.name
known={str(p/'Contents/MacOS/WPSFormatter') for p in (source,installed)}
for line in subprocess.check_output(['ps','-axo','pid=,comm='],text=True).splitlines():
    fields=line.strip().split(None,1)
    if len(fields)==2 and fields[1] in known:
        os.kill(int(fields[0]),15)
time.sleep(1)
staged=base/('.install-'+uuid.uuid4().hex+'.app')
shutil.copytree(source,staged)
subprocess.run(['codesign','--verify','--deep','--strict',str(staged)],check=True)
if installed.exists():
    installed.rename(base/('previous-'+uuid.uuid4().hex+'.app'))
staged.rename(installed)
config={'Label':label,'ProgramArguments':[str(installed/'Contents/MacOS/WPSFormatter'),'--background'],
        'RunAtLoad':True,'KeepAlive':True,'ThrottleInterval':10,
        'StandardOutPath':str(base/'service.log'),'StandardErrorPath':str(base/'service-error.log')}
agent.write_bytes(plistlib.dumps(config))
subprocess.run(['launchctl','bootstrap',domain,str(agent)],check=True)
deadline=time.monotonic()+15
while True:
    try:
        with urlopen('http://127.0.0.1:38941/ribbon.xml',timeout=2) as response:
            if response.read() != (source/'Contents/Resources/addin/ribbon.xml').read_bytes():
                raise SystemExit('服务资源与当前版本不一致，请检查占用 38941 端口的进程。')
        break
    except (URLError, TimeoutError):
        if time.monotonic()>=deadline:
            raise SystemExit('服务未在 15 秒内就绪，请查看 '+str(base/'service-error.log'))
        time.sleep(.25)
print('已安装且服务验证通过：'+str(installed))
print('登录后自动启动；无需单独打开排版工具。')
