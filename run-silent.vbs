Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File ""c:\antigravity_projects\youtube-automation-agent\run-server-background.ps1""", 0, False
