require("dotenv").config();
const nodemailer = require("nodemailer");

async function testSMTP() {
  console.log("Testing SMTP connection with credentials from .env...");
  console.log("SMTP_HOST:", process.env.SMTP_HOST);
  console.log("SMTP_USER:", process.env.SMTP_USER);
  console.log("SMTP_PASS length:", process.env.SMTP_PASS ? process.env.SMTP_PASS.length : 0);
  
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    await transporter.verify();
    console.log("SMTP connection verified successfully!");
  } catch (err) {
    console.error("SMTP verification failed:", err);
  }
}

testSMTP();
