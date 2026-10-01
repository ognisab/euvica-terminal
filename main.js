const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let isVisible = false;

// Logging für den Auto-Updater aktivieren (hilft beim Debuggen in der Konsole)
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';

// Pfad zur Konfigurationsdatei im AppData-Ordner
const configPath = path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
    try {
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error("Fehler beim Laden der Config:", err);
    }
    return { user_id: "", guild_id: "", shortcut: "Alt+X" };
}

function saveConfig(config) {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.error("Fehler beim Speichern der Config:", err);
        return false;
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 950,
        height: 550,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true, // Verhindert einen doppelten Eintrag in der Windows-Taskleiste
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // WICHTIG: Das Spiel läuft im Fullscreen/Borderless, daher setzen wir das Fenster auf 'screen-saver' (höchste Ebene)
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.loadFile('index.html');

    // Standardmäßig beim Start erst mal versteckt im Tray lassen
    mainWindow.hide();

    // Integriertes, fehlerfreies Rechtsklick-Kontextmenü für Copy & Paste
    mainWindow.webContents.on('context-menu', (event, props) => {
        const { editFlags } = props;
        const menuTemplate = [];

        if (props.isEditable) {
            menuTemplate.push(
                { label: 'Ausschneiden', role: 'cut', enabled: editFlags.canCut },
                { label: 'Kopieren', role: 'copy', enabled: editFlags.canCopy },
                { label: 'Einfügen', role: 'paste', enabled: editFlags.canPaste },
                { type: 'separator' },
                { label: 'Alles auswählen', role: 'selectAll' }
            );
        } else if (props.selectionText && props.selectionText.trim().length > 0) {
            menuTemplate.push(
                { label: 'Kopieren', role: 'copy' }
            );
        }

        if (menuTemplate.length > 0) {
            const contextMenu = Menu.buildFromTemplate(menuTemplate);
            contextMenu.popup({ window: mainWindow });
        }
    });

    // Abfangen, wenn das Fenster über den Schließen-Button geschlossen wird -> Stattdessen nur verstecken!
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
            isVisible = false;
        }
    });
}

app.whenReady().then(() => {
    createWindow();

    // --- SYSTEM TRAY ICON ERSTELLEN ---
    const iconPath = path.join(__dirname, 'logo.ico');
    tray = new Tray(iconPath);
    
    const contextMenuTemplate = Menu.buildFromTemplate([
        { 
            label: 'Euvica Terminal öffnen/schließen', 
            click: () => toggleOverlay() 
        },
        { type: 'separator' },
        { 
            label: 'Nach Updates suchen...', 
            click: () => {
                autoUpdater.checkForUpdates();
            } 
        },
        { type: 'separator' },
        { 
            label: 'Beenden', 
            click: () => {
                app.isQuitting = true;
                app.quit();
            } 
        }
    ]);

    tray.setToolTip('Euvica Ingame Terminal');
    tray.setContextMenu(contextMenuTemplate);

    // Bei Doppelklick auf das Tray-Icon ebenfalls umschalten
    tray.on('double-click', () => {
        toggleOverlay();
    });

    // Hotkey registrieren
    registerAppShortcut();

    // --- AUTO-UPDATER EVENTS ---
    // Prüfen, ob Updates da sind, sobald die App bereit ist (läuft im Hintergrund)
    autoUpdater.checkForUpdatesAndNotify();

    autoUpdater.on('update-available', () => {
        console.log("Ein neues Update wurde gefunden. Lade herunter...");
    });

    autoUpdater.on('update-downloaded', () => {
        console.log("Update heruntergeladen. Es wird beim Schließen / Neustarten installiert.");
        // Optional: Hier könnte man direkt das Update erzwingen via autoUpdater.quitAndInstall()
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

function toggleOverlay() {
    if (!mainWindow) return;
    
    if (isVisible) {
        mainWindow.hide();
        isVisible = false;
    } else {
        mainWindow.show();
        mainWindow.focus();
        if (mainWindow.webContents) {
            mainWindow.webContents.focus();
        }
        isVisible = true;
    }
    mainWindow.webContents.send('toggle-ui', isVisible);
}

function registerAppShortcut() {
    globalShortcut.unregisterAll();
    const config = loadConfig();
    const shortcutKey = config.shortcut || 'Alt+X';

    try {
        globalShortcut.register(shortcutKey, () => {
            toggleOverlay();
        });
    } catch (err) {
        console.error("Fehler beim Registrieren des Hotkeys:", err);
    }
}

// IPC Events für Renderer (Einstellungen laden/speichern)
ipcMain.on('get-config-sync', (event) => {
    event.returnValue = loadConfig();
});

ipcMain.on('save-config-sync', (event, newConfig) => {
    const success = saveConfig(newConfig);
    if (success) {
        registerAppShortcut(); // Hotkey direkt aktualisieren
    }
    event.returnValue = success;
});

ipcMain.on('close-overlay', () => {
    if (mainWindow) {
        mainWindow.hide();
        isVisible = false;
    }
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});