!macro customUnInstall
    ; Versucht, laufende Instanzen vor der Deinstallation automatisch zu beenden
    nsExec::Exec 'taskkill /f /im "Euvica Terminal.exe"'
!macroend