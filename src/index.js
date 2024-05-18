import dotenv from 'dotenv';
dotenv.config();
import { makeWASocket, Browsers, jidDecode, makeInMemoryStore, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, DisconnectReason, useMultiFileAuthState, getAggregateVotesInPollMessage } from '@whiskeysockets/baileys';
import { Handler, Callupdate, GroupUpdate } from './event/index.js'
import { Boom } from '@hapi/boom';
import express from 'express';
import pino from 'pino';
import fs from 'fs';
import NodeCache from 'node-cache';
import path from 'path';
import chalk from 'chalk';
import { writeFile } from 'fs/promises'
import moment from 'moment-timezone'
import axios from 'axios';
import * as os from 'os'

const sessionName = "session";
const app = express();
const orange = chalk.bold.hex("#FFA500");
const lime = chalk.bold.hex("#32CD32");
let useQR;
let isSessionPutted;
const PORT = process.env.PORT || 3000;


const MAIN_LOGGER = pino({
    timestamp: () => `,"time":"${new Date().toJSON()}"`
});
const logger = MAIN_LOGGER.child({});
logger.level = "trace";

const msgRetryCounterCache = new NodeCache();

const store = makeInMemoryStore({
    logger: pino().child({
        level: 'silent',
        stream: 'store'
    })
})



// Baileys Connection Option
async function start() {
  if(!process.env.SESSION_ID) {
    useQR = true;
    isSessionPutted = false;
  } else {
    useQR = false;
    isSessionPutted = true;
  }
  
    let { state, saveCreds } = await useMultiFileAuthState(sessionName);
    let { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(chalk.red("CODED BY GOUTAM KUMAR & Ethix-Xsid"));
    console.log(chalk.green(`using WA v${version.join(".")}, isLatest: ${isLatest}`));
    
 const Device = (os.platform() === 'win32') ? 'Windows' : (os.platform() === 'darwin') ? 'MacOS' : 'Linux'
    const Matrix = makeWASocket({
        version,
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: useQR,
        browser: [Device, 'chrome', '121.0.6167.159'],
        patchMessageBeforeSending: (message) => {
            const requiresPatch = !!(
                message.buttonsMessage ||
                message.templateMessage ||
                message.listMessage
            );
            if (requiresPatch) {
                message = {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: {
                                deviceListMetadataVersion: 2,
                                deviceListMetadata: {},
                            },
                            ...message,
                        },
                    },
                };
            }
            return message;
        },
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        getMessage: async (key) => {
            if (store) {
                const msg = await store.loadMessage(key.remoteJid, key.id)
                return msg.message || undefined
            }
            return {
                conversation: "Hello World"
            }
        },
        markOnlineOnConnect: true, // set false for offline
        generateHighQualityLinkPreview: true, // make high preview link
        defaultQueryTimeoutMs: undefined,
        msgRetryCounterCache
    });
    store?.bind(Matrix.ev);
    
     // Manage Device Loging
 if (!Matrix.authState.creds.registered && isSessionPutted) {
    const sessionID = process.env.SESSION_ID.split('Ethix-MD&')[1];
    const pasteUrl = `https://pastebin.com/raw/${sessionID}`;
    const response = await fetch(pasteUrl);
    const text = await response.text();
    if (typeof text === 'string') {
      fs.writeFileSync('./session/creds.json', text);
      console.log('session file created')
      await start()
    }
  }

        // response cmd pollMessage
async function getMessage(key) {
    if (store) {
        const msg = await store.loadMessage(key.remoteJid, key.id);
        return msg?.message;
    }
    return {
        conversation: "Hello World",
    };
}


    // Handle Incomming Messages
    Matrix.ev.on("messages.upsert", async chatUpdate => await Handler(chatUpdate, Matrix, logger));
    Matrix.ev.on("call", async (json) => await Callupdate(json, Matrix));
    Matrix.ev.on("group-participants.update", async (messag) => await GroupUpdate(Matrix, messag));
    
     
    if (process.env.MODE === 'public') {
    Matrix.public = true;
} else if (process.env.MODE === 'self') {
    Matrix.public = false;
}


    // Check baileys connections
    Matrix.ev.on("connection.update", async update => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            if (reason === DisconnectReason.connectionClosed) {
                console.log(chalk.red("[😩] Connection closed, reconnecting."));
                start();
            } else if (reason === DisconnectReason.connectionLost) {
                console.log(chalk.red("[🤕] Connection Lost from Server, reconnecting."));
                start();
            } else if (reason === DisconnectReason.loggedOut) {
                console.log(chalk.red("[😭] Device Logged Out, Please Delete Session and Scan Again."));
                process.exit();
            } else if (reason === DisconnectReason.restartRequired) {
                console.log(chalk.blue("[♻️] Server Restarting."));
                start();
            } else if (reason === DisconnectReason.timedOut) {
                console.log(chalk.red("[⏳] Connection Timed Out, Trying to Reconnect."));
                start();
            } else {
                console.log(chalk.red("[🚫️]Something Went Wrong: Faild to Make Connection"));
                start();
            }
        }

        if (connection === "open") {
            console.log(lime("😃 Initigration Sucsessed️ ✅"));
            Matrix.sendMessage(Matrix.user.id, { text: `😃 Initigration Sucsessed️ ✅` });
        }
    });
}

start();
app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});