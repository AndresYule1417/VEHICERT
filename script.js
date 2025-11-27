// Importaciones de Firebase se ajustan para usar la CDN
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Configuración de Colores y Voces ---
const COLORS = {
    VERDE: '#34bd94',
    AZUL: '#1d5a91',
    AZUL_CLARO: '#2594c4',
    GRIS_AZULADO: '#475a60',
    AMARILLO_SOPORTE: '#eab308',
};

const VOICES = {
    VEHI_ASISTENTE: { voiceName: "Kore", speaker: "VEHI-ASISTENTE", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } }, 
    USUARIO: { voiceName: "Puck", speaker: "USUARIO", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } }, 
};

// URL de Soporte Técnico (Mock)
const SUPPORT_LINK = "https://soporte.vehicert.com/db_mock"; 
// URL de Escalada (Mock)
const HUMAN_LINK = "https://quejas.vehicert.com/contacto_humano"; 

// --- Estado Global del Chat ---
const state = {
    messages: [],
    step: 'INIT', // INIT, ROLE_SELECT, MAIN_MENU, FLOW_10_VIN, FLOW_10_DETAILS, FLOW_10_UPLOAD, FLOW_10_CONFIRM, FALLBACK 
    userRole: null,
    vinOrPlate: '',
    isTyping: false,
    isPlaying: false,
    ttsTargetText: null,
    auth: null, 
    db: null, 
    ttsAudio: null, 
    // Variables para Firestore
    appId: typeof __app_id !== 'undefined' ? __app_id : 'default-app-id',
    userId: null,
    dbDocRef: null,
    dbData: {
        messages: [], // Array de mensajes para simular historial en DB
        lastReset: new Date().toISOString(),
        testData: "Data de prueba para testing"
    }
};

// --- Referencias al DOM (Inicialmente vacío, se llena en initChatbot) ---
let elements = {}; 

// --- Funciones Auxiliares de Audio (TTS) ---
const base64ToArrayBuffer = (base64) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};

const pcmToWav = (pcmData, sampleRate) => {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmData.length * (bitsPerSample / 8);
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    let offset = 0;

    // RIFF header
    view.setUint32(offset, 0x46464952, false); offset += 4; // "RIFF"
    view.setUint32(offset, 36 + dataSize, true); offset += 4; // File size
    view.setUint32(offset, 0x45564157, false); offset += 4; // "WAVE"

    // FMT sub-chunk
    view.setUint32(offset, 0x20746d66, false); offset += 4; // "fmt "
    view.setUint32(offset, 16, true); offset += 4; // Sub-chunk size
    view.setUint16(offset, 1, true); offset += 2; // Audio format (PCM = 1)
    view.setUint16(offset, numChannels, true); offset += 2; // Num channels
    view.setUint32(offset, sampleRate, true); offset += 4; // Sample rate
    view.setUint32(offset, byteRate, true); offset += 4; // Byte rate
    view.setUint16(offset, blockAlign, true); offset += 2; // Block align
    view.setUint16(offset, bitsPerSample, true); offset += 2; // Bits per sample

    // Data sub-chunk
    view.setUint32(offset, 0x61746164, false); offset += 4; // "data"
    view.setUint32(offset, dataSize, true); offset += 4; // Data size

    // Write PCM data
    for (let i = 0; i < pcmData.length; i++) {
        view.setInt16(offset, pcmData[i], true); offset += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
};

/**
 * Llama al API de TTS para convertir texto a audio y reproducirlo.
 */
const synthesizeAndPlay = async (text, voiceConfig) => {
    if (state.ttsAudio) {
        state.ttsAudio.pause();
        state.ttsAudio.currentTime = 0;
        state.ttsAudio = null;
    }

    const apiKey = ""; 
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;

    // Seleccionar el botón TTS activo (el último renderizado)
    const ttsButton = document.querySelector('.tts-button.active-tts');
    if (ttsButton) ttsButton.classList.add('playing');
    state.isPlaying = true;

    try {
        // Función de reintento con backoff exponencial
        const fetchWithRetry = async (url, options, retries = 3) => {
            for (let i = 0; i < retries; i++) {
                try {
                    const response = await fetch(url, options);
                    if (response.status !== 429 && response.ok) return response;
                    if (response.status === 429 && i < retries - 1) {
                        const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                    throw new Error(`HTTP error! status: ${response.status}`);
                } catch (error) {
                    if (i === retries - 1) throw error;
                }
            }
        };

        const response = await fetchWithRetry(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: text }] }],
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: { voiceConfig: voiceConfig }
                },
                model: "gemini-2.5-flash-preview-tts"
            })
        });

        const result = await response.json();
        const part = result?.candidates?.[0]?.content?.parts?.[0];
        const audioData = part?.inlineData?.data;
        const mimeType = part?.inlineData?.mimeType;

        if (audioData && mimeType && mimeType.startsWith("audio/")) {
            const match = mimeType.match(/rate=(\d+)/);
            const sampleRate = match ? parseInt(match[1], 10) : 16000;

            const pcmData = base64ToArrayBuffer(audioData);
            const pcm16 = new Int16Array(pcmData);
            const wavBlob = pcmToWav(pcm16, sampleRate);
            const audioUrl = URL.createObjectURL(wavBlob);

            state.ttsAudio = new Audio(audioUrl);
            state.ttsAudio.play();

            state.ttsAudio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                if (ttsButton) ttsButton.classList.remove('playing');
                state.isPlaying = false;
                state.ttsTargetText = null;
                updateUI(); 
            };
        } else {
            console.error("TTS response missing audio data or invalid mime type.");
        }
    } catch (error) {
        console.error("Error al sintetizar y reproducir audio:", error);
        if (ttsButton) ttsButton.classList.remove('playing');
        state.isPlaying = false;
        state.ttsAudio = null;
        updateUI();
    }
};

const handleTogglePlay = (text) => {
    // Si ya está reproduciendo el mismo texto, detener.
    if (state.isPlaying && state.ttsTargetText === text) {
        if (state.ttsAudio) {
            state.ttsAudio.pause();
            state.ttsAudio.currentTime = 0;
            state.ttsAudio = null;
        }
        state.isPlaying = false;
        state.ttsTargetText = null;
    } else {
        // Si está reproduciendo otro texto o está detenido, iniciar con el nuevo texto.
        state.ttsTargetText = text;
        synthesizeAndPlay(text, VOICES.VEHI_ASISTENTE.voiceConfig);
    }
    updateUI(); 
};

// --- Funciones de Renderizado de UI ---

const scrollToBottom = () => {
    elements.messagesArea.scrollTop = elements.messagesArea.scrollHeight;
};

const addMessage = (text, sender, isCommand = false) => {
    state.messages.push({ text, sender, timestamp: Date.now(), isCommand });
    state.ttsTargetText = null; 
    renderMessages();
    
    // Si es mensaje del bot y no es una respuesta de comando, pre-seleccionar para TTS
    if (sender === VOICES.VEHI_ASISTENTE.speaker && !isCommand) {
        state.ttsTargetText = text;
    }
    
    updateUI();
};

const renderMessages = () => {
    elements.messagesArea.innerHTML = '';
    state.messages.forEach((msg, index) => {
        const isSystem = msg.sender === VOICES.VEHI_ASISTENTE.speaker;
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message-bubble', isSystem ? 'message-bot' : 'message-user');
        
        // Estilo especial para respuestas de comandos
        if (isSystem && msg.isCommand) {
            messageDiv.classList.add('system-command');
        }
        
        messageDiv.innerHTML = `<p>${msg.text}</p>`;
        elements.messagesArea.appendChild(messageDiv);

        // Renderizar el botón de TTS debajo del último mensaje del sistema que NO sea un comando
        if (isSystem && !msg.isCommand && index === state.messages.length - 1 && 
            state.step !== 'FLOW_10_UPLOAD' && state.step !== 'FLOW_10_CONFIRM') {
            
            const ttsContainer = document.createElement('div');
            ttsContainer.classList.add('tts-button-container');

            const ttsButton = document.createElement('button');
            ttsButton.classList.add('tts-button');
            ttsButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mic"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
            `;
            ttsButton.onclick = () => handleTogglePlay(msg.text);
            
            // Marcar el botón TTS activo
            if (state.ttsTargetText === msg.text) {
                ttsButton.classList.add('active-tts');
                if (state.isPlaying) {
                    ttsButton.classList.add('playing');
                }
            }

            ttsContainer.appendChild(ttsButton);
            elements.messagesArea.appendChild(ttsContainer);
        }
    });

    // Agregar indicador de escritura si es necesario
    if (state.isTyping) {
        const typingDiv = document.createElement('div');
        typingDiv.classList.add('typing-indicator');
        typingDiv.textContent = 'VEHI-ASISTENTE está escribiendo';
        elements.messagesArea.appendChild(typingDiv);
    }

    scrollToBottom();
};

const renderButtons = () => {
    elements.buttonOptionsContainer.innerHTML = '';
    let buttonsHTML = '';

    const createButton = (text, type, action, fullWidth = false, link = null) => {
        const widthClass = fullWidth ? 'w-full' : 'w-auto';
        const tag = link ? 'a' : 'button';
        const linkAttr = link ? `href="${link}" target="_blank"` : '';
        return `<${tag} class="chip-button ${type} ${widthClass}" data-action="${action}" ${linkAttr}>${text}</${tag}>`;
    };
    
    // Botón Volver al Menú (Flujo)
    const showVolverAlMenu = (state.step !== 'INIT' && state.step !== 'MAIN_MENU' && state.step !== 'ROLE_SELECT');

    switch (state.step) {
        case 'ROLE_SELECT':
            // Roles como chips verdes (color de acento)
            buttonsHTML = `
                ${createButton('Particular', 'chip-button-accent', 'selectRole:Particular')}
                ${createButton('Taller', 'chip-button-accent', 'selectRole:Taller')}
                ${createButton('Empresa grande', 'chip-button-accent', 'selectRole:Empresa')}
            `;
            break;
        case 'MAIN_MENU':
            // Opciones del menú (replicando el diseño con el color azul primario y teal para 'Volver')
            buttonsHTML = `
                ${createButton('Agendar Cita (Flujo 3)', 'chip-button-primary', 'selectMenu:Agendar Cita')}
                ${createButton('Recordatorios (Flujo 2)', 'chip-button-primary', 'selectMenu:Recordatorios')}
                ${createButton('Consulta Legal (Flujo 4)', 'chip-button-primary', 'selectMenu:Consulta Legal')}
                ${createButton('VEHI-Score (Flujo 5)', 'chip-button-primary', 'selectMenu:VEHI-Score')}
                ${createButton('Historial Vehicular (Flujo 6)', 'chip-button-primary', 'selectMenu:Historial')}
                ${createButton('Renovación/Vida Útil (Flujo 7)', 'chip-button-primary', 'selectMenu:Renovación/Vida Útil')}
                ${createButton('Subir Evidencia (Flujo 8)', 'chip-button-primary', 'selectMenu:Subir Evidencia:disabled')}
                ${createButton('Auditoría (Flujo 10)', 'chip-button-primary', 'selectMenu:Auditoría')}
            `;
            
            // Botón "Volver a elegir Rol" (color de acento/verde/teal)
            elements.buttonOptionsContainer.innerHTML += buttonsHTML;
            buttonsHTML = createButton('Volver a elegir Rol', 'chip-button-accent', 'selectMenu:Volver a elegir Rol');
            break;
        case 'FLOW_10_UPLOAD':
            // Elemento de carga simulado
            const uploadBox = document.createElement('div');
            uploadBox.classList.add('upload-simulation-box');
            uploadBox.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 5px; display: block; color: ${COLORS.VERDE};"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.6-.4-1-1-1h-1M2 17h3l2-4h10l2 4M2 7h20M7 7v4M17 7v4M3 10h18M5 17h14M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM17 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/></svg>
                <p style="margin: 0; font-weight: 500;">Simulación: Haz clic en el botón para cargar la "Evidencia Mecánica".</p>
            `;
            elements.buttonOptionsContainer.appendChild(uploadBox);
            
            buttonsHTML = createButton('Subir Evidencia (Simulación)', 'chip-button-accent', 'handleUploadEvidence', true);
            break;
        case 'FLOW_10_CONFIRM':
            buttonsHTML = createButton('Finalizar Auditoría', 'chip-button-accent', 'handleFinishFlow', true);
            break;
        case 'FALLBACK': // NUEVO ESTADO DE FALLBACK
            // Botones de Soporte y Escalada
            buttonsHTML = `
                ${createButton('Contactar Soporte Técnico (DB mock)', 'chip-button-support', 'link:support', false, SUPPORT_LINK)}
                ${createButton('Hablar con un Humano (Quejas/Sugerencias)', 'chip-button-primary', 'link:human', true, HUMAN_LINK)}
            `;
            break;
        default:
            // No buttons unless specified in a flow
            break;
    }
    
    // Agregar botones al contenedor
    elements.buttonOptionsContainer.innerHTML += buttonsHTML;
    
    // Botón 'Volver al Menú' para flujos activos
    if (showVolverAlMenu) {
         const volverButton = document.createElement('button');
         volverButton.classList.add('chip-button', 'chip-button-flow');
         volverButton.setAttribute('data-action', 'selectMenu:Volver al Menú:flow');
         volverButton.innerHTML = `
             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; margin-right:5px;"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
             Volver al Menú
         `;
         elements.buttonOptionsContainer.appendChild(volverButton);
    }
    
    // Re-añadir listeners después de renderizar
    setupButtonListeners();
};


const updateInputState = () => {
    // Permitir input en el fallback para que el usuario pueda intentar de nuevo
    const enableInput = state.step === 'FLOW_10_VIN' || state.step === 'FLOW_10_DETAILS' || state.step === 'MAIN_MENU' || state.step === 'FALLBACK' || state.step === 'INIT'; 
    
    elements.userInput.disabled = !enableInput || state.isTyping;
    elements.sendButton.disabled = !enableInput || state.isTyping;

    elements.userInput.placeholder = state.step === 'FLOW_10_VIN' 
        ? "Ej: ABC123XYZ0000000 o XYZ-001" 
        : "Escribe tu mensaje o un comando (ej: /debug)";
    
    // Actualizar el mensaje inferior de "Alternar a teclado" (si el input está deshabilitado)
    const keyboardMessage = document.getElementById('keyboard-message');
    const isButtonFlow = state.step === 'ROLE_SELECT' || state.step === 'FLOW_10_UPLOAD' || state.step === 'FLOW_10_CONFIRM';
    
    if (keyboardMessage) {
        keyboardMessage.style.opacity = isButtonFlow ? '1' : '0.7';
        keyboardMessage.style.color = isButtonFlow ? COLORS.GRIS_AZULADO : '#9ca3af';
        keyboardMessage.textContent = isButtonFlow ? "Selecciona una opción de arriba" : "Escribe un comando de testing, ej: /debug";
    }
};

const updateUI = () => {
    renderMessages();
    renderButtons();
    updateInputState();
};

// --- Funciones de Flujo de Conversación (Intents) ---

const simulateResponse = (text, nextStep, triggerTTS = true, isCommand = false) => {
    state.isTyping = true;
    updateUI(); // Muestra el indicador de escritura

    setTimeout(() => {
        addMessage(text, VOICES.VEHI_ASISTENTE.speaker, isCommand);
        state.step = nextStep;
        state.isTyping = false;
        
        // Si el mensaje del bot es el mismo que el objetivo de TTS y no es un comando, reproducir.
        if (triggerTTS && state.ttsTargetText && !isCommand) {
             handleTogglePlay(state.ttsTargetText);
        } else {
             state.ttsTargetText = null;
        }

        updateUI(); // Oculta el indicador y renderiza botones/input
    }, 1000); // 1 segundo de simulación de escritura
};
        
// --- Flujo 11: Comandos de Testing ---
const handleTestingCommand = async (userMessage) => {
    const msg = userMessage.trim().toLowerCase();
    const command = msg.split(/\s+/)[0]; // Solo necesitamos el primer token
    
    let responseText = '';
    let commandHandled = false;

    if (state.dbDocRef === null) {
         // Si Firebase no ha inicializado, retornar mensaje de error del sistema.
         addMessage(`[ERROR] La base de datos no está lista para comandos de testing. Inténtalo de nuevo en unos segundos.`, VOICES.VEHI_ASISTENTE.speaker, true);
         return true;
    }


    if (command === '/reset') {
         try {
            // Resetea el documento de la DB con el estado inicial
            const INITIAL_DB_STATE = {
                messages: [], 
                lastReset: new Date().toISOString(),
                testData: "Data de prueba para testing"
            };
            await setDoc(state.dbDocRef, INITIAL_DB_STATE);
            state.dbData = INITIAL_DB_STATE;
            responseText = `[COMANDO /RESET] JSON de la base de datos (testing_doc) limpiado exitosamente.\nÚltimo reseteo: ${new Date().toLocaleTimeString('es-ES')}`;
            commandHandled = true;
        } catch (e) {
            console.error("Error al resetear Firestore:", e);
            responseText = `[COMANDO /RESET] Error al limpiar DB: ${e.message}`;
            commandHandled = true;
        }
    } else if (command === '/debug') {
        try {
            // Obtener el estado más reciente de la DB
            const docSnapshot = await getDoc(state.dbDocRef);
            const currentData = docSnapshot.exists() ? docSnapshot.data() : { error: "Documento no encontrado." };
            
            console.log(`--- DEBUG: Datos de la DB para App ID: ${state.appId} | User ID: ${state.userId} ---`);
            console.log(currentData);
            console.log('---------------------------------------------------------');
            state.dbData = currentData; // Sincronizar estado local de debug
            responseText = `[COMANDO /DEBUG] Datos del JSON de la base de datos (testing_doc) impresos en la consola (F12).`;
            commandHandled = true;
        } catch (e) {
            console.error("Error al debuguear Firestore:", e);
            responseText = `[COMANDO /DEBUG] Error al leer DB: ${e.message}`;
            commandHandled = true;
        }
    }
    
    if (commandHandled) {
        // Agregar la respuesta del comando como un mensaje especial
        simulateResponse(responseText, state.step, false, true); // No cambia de paso, no usa TTS, es un comando
    }
    return commandHandled;
};
        
// --- Manejador Principal del Input de Usuario ---
const handleIntent = async (userMessage) => {
    const msg = userMessage.trim();
    
    // 1. *CHECK COMANDOS TESTING (Flujo 11)*
    if (msg.startsWith('/')) {
        const commandHandled = await handleTestingCommand(userMessage);
        if (commandHandled) {
            // Si un comando fue manejado, no hacemos nada más.
            return; 
        }
    }

    // 2. *MANEJO DE FLUJOS NORMALES*
    const upperMsg = msg.toUpperCase();

    // Lógica existente de Flujo 10
    if (state.step === 'FLOW_10_VIN') {
        const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/i;
        const plateRegex = /^[A-Z0-9]{3,7}([- ]?[A-Z0-9]{1,4})?$/i;

        if (vinRegex.test(upperMsg) || plateRegex.test(upperMsg)) {
            state.vinOrPlate = upperMsg;
            simulateResponse(`Confirmado. El vehículo con Placa/VIN **${upperMsg}** es el que deseas auditar. Por favor, detalla la situación o el problema a reportar (Ej: "Ruido en motor", "Golpe lateral").`, 'FLOW_10_DETAILS');
        } else {
            simulateResponse("El formato de Placa o VIN no parece ser válido. Por favor, ingresa un número de 17 caracteres (VIN) o el formato de Placa correcto (Ej: ABC-123, YZZ-888).", 'FLOW_10_VIN');
        }
    } else if (state.step === 'FLOW_10_DETAILS') {
        simulateResponse(`Recibida la descripción del problema: *"${userMessage}"*. Ahora, para respaldar tu reporte, puedes subir la evidencia correspondiente. Esto puede incluir fotos del daño o audios del ruido.`, 'FLOW_10_UPLOAD');
    } else if (state.step === 'FALLBACK' || state.step === 'INIT') {
         // Si el usuario reintenta después de un fallback, o si escribe al inicio, lo enviamos al menú principal (o lo re-guiamos)
         if (state.userRole) {
            simulateResponse("Entiendo. Regresando al menú principal para que puedas seleccionar tu opción de nuevo.", 'MAIN_MENU');
         } else {
             simulateResponse("¡Hola de nuevo! Recuerda que primero debes seleccionar tu rol.", 'ROLE_SELECT', false);
         }
    } else {
        // 3. FALLBACK/NO MATCH (Flujo 10 - Fallback y Soporte)
        state.step = 'FALLBACK';
        simulateResponse(`Lo siento, no entiendo la acción que deseas realizar en este momento. ¿Puedes repetir tu solicitud, por favor? O puedes contactar a soporte si lo necesitas.`, 'FALLBACK');
    }
};

// --- Manejadores de Eventos (Listeners) ---

const setupButtonListeners = () => {
    elements.buttonOptionsContainer.querySelectorAll('.chip-button').forEach(button => {
        // Prevenir listener para los elementos 'a' con target='_blank' (enlaces)
        if (button.tagName.toLowerCase() === 'a' && button.hasAttribute('target')) return;
        
        button.onclick = (e) => {
            const action = e.currentTarget.getAttribute('data-action');
            if (action.includes(':disabled')) return; // Manejar botones deshabilitados
            
            const [type, payload, flow] = action.split(':');
            
            if (type === 'selectRole') {
                handleRoleSelect(payload);
            } else if (type === 'selectMenu') {
                if (flow === 'flow') { // Botón "Volver al Menú" de flujo
                    state.step = 'MAIN_MENU';
                    addMessage(payload, VOICES.USUARIO.speaker);
                    simulateResponse(`Regresaste al menú principal. ¿Qué deseas hacer ahora, **${state.userRole}**?`, 'MAIN_MENU', false);
                } else {
                    handleMenuSelect(payload);
                }
            } else if (type === 'handleUploadEvidence') {
                handleUploadEvidence();
            } else if (type === 'handleFinishFlow') {
                handleFinishFlow();
            }
        };
    });
};

const handleRoleSelect = (role) => {
    state.userRole = role;
    addMessage(role, VOICES.USUARIO.speaker);
    // Simular una respuesta más rápida después de seleccionar el rol
    state.isTyping = true;
    updateUI(); 
    setTimeout(() => {
        addMessage(`¡Bienvenido, **${role}**! ¿Qué necesitas? (Opciones abajo)`, VOICES.VEHI_ASISTENTE.speaker);
        state.step = 'MAIN_MENU';
        state.isTyping = false;
        state.ttsTargetText = `¡Bienvenido, ${role}! ¿Qué necesitas? Opciones abajo`;
        handleTogglePlay(state.ttsTargetText);
        updateUI();
    }, 500);
};

const handleMenuSelect = (option) => {
    addMessage(option.replace(/\s\(Flujo \d\)/g, ''), VOICES.USUARIO.speaker);

    if (option === 'Auditoría (Flujo 10)') {
        simulateResponse(`¡Claro! Iniciemos tu solicitud de Auditoría para un vehículo. Por favor, **Ingresa la Placa o el VIN** del vehículo a consultar. (Ej: VIN: ABC123...XYZ, Placa: XYZ-001).`, 'FLOW_10_VIN');
    } else if (option === 'Volver a elegir Rol') {
        state.step = 'INIT';
        state.userRole = null;
        state.messages = [];
        // Se reinicia el flujo de bienvenida
        simulateResponse("¡Hola! Soy VEHI-ASISTENTE de VEHICERT. ¿Eres particular, taller o empresa grande?", 'ROLE_SELECT', false);
    } else {
        simulateResponse(`Has seleccionado **${option.replace(/\s\(Flujo \d\)/g, '')}**. Esta funcionalidad está en desarrollo. Por favor, elige la opción de "Auditoría" o "Volver a elegir Rol".`, 'MAIN_MENU');
    }
};

const handleUploadEvidence = () => {
    addMessage('Subir Evidencia (Simulación)', VOICES.USUARIO.speaker);
    simulateResponse(`(Carga simulada) ¡Evidencia cargada exitosamente! El ID de tu vehículo es ${state.vinOrPlate.toUpperCase()}. El reporte ha sido procesado.`, 'FLOW_10_CONFIRM');
};

const handleFinishFlow = () => {
    const reportId = Math.floor(100000 + Math.random() * 900000);
    addMessage('Finalizar Auditoría', VOICES.USUARIO.speaker);
    simulateResponse(`**Proceso de Auditoría Finalizado.** Tu caso ha sido asignado al ID **#${reportId}**. Recibirás una notificación con los próximos pasos. ¿Deseas realizar alguna otra consulta o volver al menú principal?`, 'MAIN_MENU');
    state.vinOrPlate = '';
};


// --- Inicialización ---

const initChatbot = () => {
     // *CORRECCIÓN:* Obtener referencias del DOM aquí para asegurar que los elementos ya estén cargados.
    elements = {
        chatContainer: document.getElementById('chatbot-container'),
        openButton: document.getElementById('open-chat-button'),
        closeButton: document.getElementById('close-chat-button'),
        messagesArea: document.getElementById('messages-area'),
        inputForm: document.getElementById('input-form'),
        userInput: document.getElementById('user-input'),
        sendButton: document.getElementById('send-button'),
        buttonOptionsContainer: document.getElementById('button-options-container'),
    };

    // 1. Inicializar Firebase Auth y Firestore
    try {
        const firebaseConfig = typeof _firebase_config !== 'undefined' ? JSON.parse(_firebase_config) : {};
        if (Object.keys(firebaseConfig).length > 0) {
            const app = initializeApp(firebaseConfig);
            state.db = getFirestore(app);
            state.auth = getAuth(app);
            
            const token = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
            
            onAuthStateChanged(state.auth, async (user) => {
                if (user) {
                     state.userId = user.uid;
                } else {
                    try {
                        if (token) {
                            await signInWithCustomToken(state.auth, token);
                        } else {
                            await signInAnonymously(state.auth);
                        }
                        state.userId = state.auth.currentUser?.uid || crypto.randomUUID();
                    } catch (error) {
                        console.error("Firebase Auth: Error de inicio de sesión.", error);
                        state.userId = crypto.randomUUID();
                    }
                }
                
                // Definir referencia del documento para comandos de testing (Flujo 11)
                const publicCollectionPath = `artifacts/${state.appId}/public/data/testing_data`;
                state.dbDocRef = doc(state.db, publicCollectionPath, 'testing_doc');
                
                // Cargar el estado inicial o suscribirse
                onSnapshot(state.dbDocRef, (docSnapshot) => {
                    if (docSnapshot.exists()) {
                        state.dbData = docSnapshot.data();
                    } else {
                        const INITIAL_DB_STATE = { messages: [], lastReset: new Date().toISOString(), testData: "Data de prueba para testing" };
                        setDoc(state.dbDocRef, INITIAL_DB_STATE).catch(e => console.error("Error al crear documento de testing:", e));
                        state.dbData = INITIAL_DB_STATE;
                    }
                    console.log("Firebase/Firestore listo. User ID:", state.userId);
                }, (error) => {
                    console.error("Error en onSnapshot (testing_data):", error);
                });
            });
        }
    } catch (e) {
        console.error("Firebase Init Error:", e);
    }

    // 2. Event listeners para abrir/cerrar
    elements.openButton.onclick = () => elements.chatContainer.classList.add('open');
    elements.closeButton.onclick = () => {
        elements.chatContainer.classList.remove('open');
        // Detener TTS al cerrar el chat
        if (state.ttsAudio) {
            state.ttsAudio.pause();
            state.ttsAudio.currentTime = 0;
            state.ttsAudio = null;
            state.isPlaying = false;
            state.ttsTargetText = null;
            updateUI();
        }
    };

    // 3. Event listener para enviar mensaje
    elements.inputForm.onsubmit = async (e) => {
        e.preventDefault();
        const input = elements.userInput.value.trim();
        if (input && !elements.userInput.disabled) {
            elements.userInput.value = '';
            addMessage(input, VOICES.USUARIO.speaker);
            await handleIntent(input);
        }
    };

    // 4. Iniciar el flujo de bienvenida
    simulateResponse("¡Hola! Soy VEHI-ASISTENTE de VEHICERT. ¿Eres particular, taller o empresa grande?", 'ROLE_SELECT', false);
};

// Iniciar la aplicación al cargar la ventana
window.onload = initChatbot;