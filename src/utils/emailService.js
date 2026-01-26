import pkg from 'nodemailer';
const nodemailer = pkg.default || pkg;

// Email transporter oluştur
const createTransporter = () => {
  const config = {
    host: process.env.SMTP_HOST || process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT || 587),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER || process.env.EMAIL_USER,
      pass: process.env.SMTP_PASS || process.env.EMAIL_PASSWORD
    }
  };
  
  return nodemailer.createTransport(config);
};

// Şifre sıfırlama email'i gönder
export const sendPasswordResetEmail = async (email, resetToken, username) => {
  try {
    const transporter = createTransporter();

    const resetURL = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: process.env.SMTP_FROM || `"${process.env.APP_NAME || 'GERAS ONLINE'}" <${process.env.SMTP_USER || process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Şifre Sıfırlama Talebi',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
            .button { 
              display: inline-block; 
              padding: 12px 30px; 
              background: #4CAF50; 
              color: white; 
              text-decoration: none; 
              border-radius: 5px; 
              margin: 20px 0;
            }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
            .warning { 
              background: #fff3cd; 
              border-left: 4px solid #ffc107; 
              padding: 15px; 
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Şifre Sıfırlama</h1>
            </div>
            <div class="content">
              <p>Merhaba <strong>${username}</strong>,</p>
              
              <p>Hesabınız için şifre sıfırlama talebinde bulundunuz. Aşağıdaki butona tıklayarak yeni şifrenizi oluşturabilirsiniz:</p>
              
              <center>
                <a href="${resetURL}" class="button">Şifremi Sıfırla</a>
              </center>
              
              <p>Veya bu linki tarayıcınıza kopyalayın:</p>
              <p style="word-break: break-all; background: #eee; padding: 10px; border-radius: 5px;">
                ${resetURL}
              </p>
              
              <div class="warning">
                <strong>⚠️ Önemli:</strong>
                <ul>
                  <li>Bu link <strong>1 saat</strong> geçerlidir</li>
                  <li>Bu talebi siz yapmadıysanız, bu email'i görmezden gelin</li>
                  <li>Güvenliğiniz için linki kimseyle paylaşmayın</li>
                </ul>
              </div>
              
              <p>İyi günler dileriz,<br><strong>${process.env.APP_NAME || 'GERAS SYSTEM'} Ekibi</strong></p>
            </div>
            <div class="footer">
              <p>Bu otomatik bir email'dir, lütfen yanıtlamayın.</p>
              <p>&copy; ${new Date().getFullYear()} ${process.env.APP_NAME || 'GERAS SYSTEM'}. Tüm hakları saklıdır.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Merhaba ${username},
        
        Hesabınız için şifre sıfırlama talebinde bulundunuz.
        
        Şifrenizi sıfırlamak için aşağıdaki linke tıklayın:
        ${resetURL}
        
        Bu link 1 saat geçerlidir.
        
        Bu talebi siz yapmadıysanız, bu email'i görmezden gelin.
        
        İyi günler dileriz,
        ${process.env.APP_NAME || 'GERAS SYSTEM'} Ekibi
      `
    };

    await transporter.sendMail(mailOptions);

    console.log('✅ Şifre sıfırlama email\'i gönderildi:', email);
    return { success: true };

  } catch (error) {
    console.error('❌ Email gönderme hatası:', error.message);
    throw new Error('Email gönderilemedi');
  }
};

// Test email gönder
export const sendTestEmail = async (email) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.SMTP_FROM || `"${process.env.APP_NAME || 'GERAS SYSTEM'}" <${process.env.SMTP_USER || process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Test Email',
      html: '<p>Email servisi çalışıyor! ✅</p>',
      text: 'Email servisi çalışıyor!'
    };

    await transporter.sendMail(mailOptions);
    return { success: true };

  } catch (error) {
    console.error('❌ Test email hatası:', error);
    throw error;
  }
};
