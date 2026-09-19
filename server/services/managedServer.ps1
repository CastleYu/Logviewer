param([Parameter(Mandatory=$true)][int]$ParentPid)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
$source = @'
using System;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;

public static class ManagedServer {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct Startup {
    public int cb; public string reserved, desktop, title;
    public int x,y,width,height,xChars,yChars,fill,flags;
    public short show,reservedSize; public IntPtr reservedBytes,input,output,error;
  }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr process,thread; public int pid,tid; }
  [StructLayout(LayoutKind.Sequential)] struct BasicLimit {
    public long processTime,jobTime; public uint flags; public UIntPtr min,max;
    public uint active; public UIntPtr affinity; public uint priority,scheduling;
  }
  [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong readOps,writeOps,otherOps,readBytes,writeBytes,otherBytes; }
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimit {
    public BasicLimit basic; public IoCounters io; public UIntPtr processMemory,jobMemory,peakProcessMemory,peakJobMemory;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateProcessW(string app,StringBuilder cmd,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref Startup startup,out ProcessInfo info);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObjectW(IntPtr attributes,string name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int type,ref ExtendedLimit info,uint size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
  [DllImport("kernel32.dll")] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
  [DllImport("kernel32.dll")] static extern uint WaitForMultipleObjects(uint count,IntPtr[] handles,bool all,uint milliseconds);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
  [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process,uint code);
  [DllImport("kernel32.dll")] static extern bool TerminateJobObject(IntPtr job,uint code);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

  static string Quote(string value) {
    StringBuilder text=new StringBuilder("\""); int slashes=0;
    foreach(char ch in value) {
      if(ch=='\\') { slashes++; continue; }
      if(ch=='\"') { text.Append('\\',slashes*2+1).Append(ch); slashes=0; continue; }
      text.Append('\\',slashes).Append(ch); slashes=0;
    }
    return text.Append('\\',slashes*2).Append('"').ToString();
  }
  public static int Run(string file,string[] args,string cwd,int ownerPid) {
    IntPtr owner=OpenProcess(0x00100000,false,ownerPid);
    if(owner==IntPtr.Zero || WaitForSingleObject(owner,0)==0) { if(owner!=IntPtr.Zero) CloseHandle(owner); return 71; }
    IntPtr job=IntPtr.Zero; ProcessInfo child=new ProcessInfo();
    try {
      job=CreateJobObjectW(IntPtr.Zero,null);
      if(job==IntPtr.Zero) return 71;
      ExtendedLimit limit=new ExtendedLimit(); limit.basic.flags=0x2000;
      if(!SetInformationJobObject(job,9,ref limit,(uint)Marshal.SizeOf(typeof(ExtendedLimit)))) return 71;
      string app=file; string command=Quote(file);
      foreach(string arg in args) command += " " + Quote(arg);
      if(file.EndsWith(".cmd",StringComparison.OrdinalIgnoreCase)||file.EndsWith(".bat",StringComparison.OrdinalIgnoreCase)) {
        app=Environment.GetEnvironmentVariable("ComSpec");
        command=Quote(app)+" /d /s /c \""+command+"\"";
      }
      Startup startup=new Startup(); startup.cb=Marshal.SizeOf(typeof(Startup)); startup.flags=1; startup.show=0;
      // Inherit this supervisor's environment; no credentials in argv or files.
      if(!CreateProcessW(app,new StringBuilder(command),IntPtr.Zero,IntPtr.Zero,false,0x08000004,IntPtr.Zero,cwd,ref startup,out child)) return 71;
      // No target code runs before ownership has been assigned.
      if(!AssignProcessToJobObject(job,child.process)) return 71;
      if(ResumeThread(child.thread)==0xffffffff) return 71;
      CloseHandle(child.thread); child.thread=IntPtr.Zero;
      using(ManualResetEvent eof=new ManualResetEvent(false)) {
        Thread reader=new Thread(delegate() { try { Console.In.ReadToEnd(); eof.Set(); } catch {} });
        reader.IsBackground=true; reader.Start();
        IntPtr[] handles={owner,child.process,eof.SafeWaitHandle.DangerousGetHandle()};
        uint finished=WaitForMultipleObjects(3,handles,false,0xffffffff);
        if(finished==1) { uint code; return GetExitCodeProcess(child.process,out code) ? (int)code : 71; }
        return finished==0 || finished==2 ? 0 : 71;
      }
    } finally {
      if(job!=IntPtr.Zero) { TerminateJobObject(job,0); CloseHandle(job); }
      if(child.process!=IntPtr.Zero) { TerminateProcess(child.process,0); WaitForSingleObject(child.process,5000); CloseHandle(child.process); }
      if(child.thread!=IntPtr.Zero) CloseHandle(child.thread);
      CloseHandle(owner);
    }
  }
}
'@
try {
  $spec = [Console]::ReadLine() | ConvertFrom-Json
  if (-not $spec.file) { exit 71 }
  $program = (Get-Command -Name $spec.file -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
  Add-Type -TypeDefinition $source -Language CSharp -ErrorAction Stop
  $code = [ManagedServer]::Run($program, [string[]]$spec.args, $spec.cwd, $ParentPid)
  exit $code
} catch { exit 71 }
