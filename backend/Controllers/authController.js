import User from '../Models/UserModel.js';
import { redisClient } from '../Utils/redisClient.js';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.Email,   // set in your .env file
    pass: process.env.password,   // set in your .env file
  },
});

export const registerController = async (req, res) => {

  const { uid, name, email, role } = req.body
  //Make sure uid from token === uid in body
  if (req.uid !== uid) {
    return res.status(403).json({ message: "UID mismatch — token is invalid for this user" });
  }

  try {
    let user = await User.findOne({ uid });
    if (!user) {
      user = new User({ uid, email, name, role });
      await user.save();
    }
    res.status(200).json({ success: true, role: user.role, user });
  }
  catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getUserController = async (req, res) => {

  const { uid } = req.params;
  try {
    const user = await User.findOne({ uid });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json({
      success: true,
      role: user.role
    });
  }
  catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// SendOTP Controller
export const sendOtpController = async (req, res) => {

  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: 'Email required' });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  console.log('Generated OTP:', otp);

  try {
    // Send OTP via Email
    await transporter.sendMail({
      from: `"TeeFusion" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your Password Reset OTP',
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2 style="color: #2563eb;">TeeFusion Password Reset</h2>
          <p>Your OTP code is:</p>
          <h3 style="letter-spacing: 3px;">${otp}</h3>
          <p>This code will expire in 5 minutes.</p>
        </div>
      `,
    });

    console.log('OTP Email Sent');
    // Save OTP in Redis with 5 minutes expiry
    await redisClient.set(`otp:${email}`, otp, { ex: 300 });

    return res.status(200).send({
      success: true,
      message: 'OTP sent to your email',
    });
  } 
  catch (err) {
    console.error('sendOtpController Error:', err);
    return res.status(500).send({
      success: false,
      message: 'Something went wrong while sending OTP',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

// Verify OTP controller
export const verifyOtpController = async (req, res) => {

  try {
    const { email, otp } = req.body;
    console.log("Received email:", email);
    console.log("Received otp:", otp);

    const key = `otp:${email.trim().toLowerCase()}`;
    const storedOTP = await redisClient.get(key);
    console.log("Stored OTP:", storedOTP);

    // Trim both values
    const trimmedOtp = otp?.toString().trim();
    const trimmedStoredOtp = storedOTP?.toString().trim();

    console.log("Comparing:", trimmedOtp, "vs", trimmedStoredOtp);

    if (!trimmedStoredOtp || trimmedOtp !== trimmedStoredOtp) {
      console.log("Mismatch or expired");
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    await redisClient.set(`otp_verified:${email.trim().toLowerCase()}`, 'true', { ex: 600 });
    await redisClient.del(key);

    console.log("OTP verified successfully");
    return res.status(200).json({
      success: true,
      message: 'OTP verified successfully'
    });
  } catch (err) {
    console.error('OTP Verification Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }

};