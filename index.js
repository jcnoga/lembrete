const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const app = express();

// Configurações básicas
app.use(cors({ origin: true }));
app.use(express.json());

const PORT = process.env.PORT || 8080;

// --- CONFIGURAÇÃO DO E-MAIL ---
// IMPORTANTE: Depois você precisará trocar isso pela sua "Senha de App" do Google
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // Pega o valor que você acabou de subir no terminal
        pass: process.env.EMAIL_PASS  // Pega a senha que você acabou de subir no terminal
    }
});

// Rota que o seu site vai chamar
app.post('/send-email', async (req, res) => {
    const { to, subject, html } = req.body;

    if(!to || !subject) {
        return res.status(400).send("Faltando dados.");
    }

    const mailOptions = {
        from: '"Lembrete App" <noreply@app.com>',
        to: to,
        subject: subject,
        html: html
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Enviado para:', to);
        res.status(200).send('Sucesso');
    } catch (error) {
        console.error('Erro:', error);
        res.status(500).send(error.toString());
    }
});

app.listen(PORT, () => {
    console.log(`Rodando na porta ${PORT}`);
});
