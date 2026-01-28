Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
d = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run "cmd /k cd /d """ & d & """ && (py run.py 2>nul || python run.py)", 1
