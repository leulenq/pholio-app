require("dotenv").config();
const { sendEmail } = require("./src/shared/lib/email");

async function testSend() {
  try {
    const result = await sendEmail({
      to: "test@example.com", // I will change this to their email to test
      subject: "Test from Pholio SMTP",
      html: "<p>If you get this, SMTP is working perfectly.</p>",
    });
    console.log("Email sent successfully!", result);
  } catch (err) {
    console.error("Failed to send email:", err);
  }
}

testSend();
