/**
 * ARQUIVO: functions/index.js
 * VERSÃO: V3 - Com Processador de Fila (Correção de envio)
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();
const db = admin.firestore();

// --- CONFIGURAÇÃO DO GMAIL ---
// IMPORTANTE: Mantenha sua Senha de App correta aqui
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: "jcnvap@gmail.com", 
        pass: "fpdf vlnk tzer eiow" // <--- COLE SUA SENHA DE APP DE 16 LETRAS AQUI
    }
});

const APP_ID = "app_fazenda_principal_01"; 

// ==================================================================
// 1. FUNÇÃO DE TESTE MANUAL (Diagnóstico)
// ==================================================================
exports.testeManualEmail = onRequest({ 
    cors: true, 
    region: "us-central1",
    invoker: "public"
}, async (req, res) => {
    const emailDestino = req.query.email || "jcnvap@gmail.com"; 
    try {
        await transporter.sendMail({
            from: '"AgriManager Teste" <jcnvap@gmail.com>',
            to: emailDestino,
            subject: "Teste Manual - Sucesso",
            text: "Seu sistema de e-mail está configurado e enviando!"
        });
        res.status(200).send(`✅ Sucesso! E-mail enviado para ${emailDestino}`);
    } catch (error) {
        logger.error("Erro no teste manual", error);
        res.status(500).send(`❌ Erro: ${error.message}`);
    }
});

// ==================================================================
// 2. PROCESSADOR DE FILA (O que estava faltando)
// Escuta quando o app.js salva algo em 'mail_queue' e envia na hora
// ==================================================================
exports.enviarEmailDaFila = onDocumentCreated(
    `agri_manager_apps/{appId}/mail_queue/{mailId}`,
    async (event) => {
        const snapshot = event.data;
        if (!snapshot) return;

        const emailData = snapshot.data();
        
        // Só processa se estiver pendente
        if (emailData.status !== 'pending') return;

        logger.info(`📨 Processando fila para: ${emailData.to}`);

        try {
            await transporter.sendMail({
                from: '"AgriManager Alerta" <jcnvap@gmail.com>',
                to: emailData.to,
                subject: emailData.message.subject,
                text: emailData.message.text,
                html: emailData.message.html
            });

            // Atualiza o documento para 'sent' (Enviado)
            await snapshot.ref.update({
                status: 'sent',
                sentAt: new Date().toISOString(),
                deliveryInfo: 'Enviado via Cloud Function (Fila)'
            });
            logger.info("✅ E-mail da fila enviado com sucesso!");

        } catch (error) {
            logger.error("❌ Falha no envio da fila:", error);
            await snapshot.ref.update({
                status: 'error',
                error: error.message
            });
        }
    }
);

// ==================================================================
// 3. VERIFICAÇÃO AGENDADA (Backup p/ App Fechado)
// Roda a cada 1 hora para garantir que nada foi perdido
// ==================================================================
exports.verificarLembretesAutomaticos = onSchedule({
    schedule: "every 1 hours",
    timeZone: "America/Sao_Paulo",
    region: "us-central1"
}, async (event) => {
    logger.info("🤖 Verificação automática iniciada...");
    const hojeStr = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }).split(',')[0].split('/').reverse().join('-');
    
    const remindersRef = db.collection(`agri_manager_apps/${APP_ID}/reminders`);
    const snapshot = await remindersRef.get();

    if (snapshot.empty) return;

    for (const doc of snapshot.docs) {
        const r = doc.data();

        // Regras de envio
        if (!r.emailEnabled || r.status === 'Concluído') continue;
        
        // Verifica se já enviou hoje (pelo App ou por execução anterior)
        const stats = r.stats || {};
        if (stats.lastEmailDate === hojeStr) continue; 

        if (r.date <= hojeStr) {
            try {
                const tipo = r.date === hojeStr ? "HOJE" : "ATRASADO";
                await transporter.sendMail({
                    from: '"AgriManager Bot" <jcnvap@gmail.com>',
                    to: "jcnvap@gmail.com",
                    subject: `[AgriManager] Lembrete ${tipo}: ${r.name}`,
                    html: `<p>Lembrete automático: <strong>${r.name}</strong></p><p>Status: ${tipo}</p>`
                });

                await doc.ref.update({
                    "stats.lastEmailDate": hojeStr,
                    "stats.emailCount": admin.firestore.FieldValue.increment(1)
                });
                logger.info(`✅ E-mail agendado enviado: ${r.name}`);
            } catch (e) {
                logger.error(`Erro envio agendado: ${r.name}`, e);
            }
        }
    }
});