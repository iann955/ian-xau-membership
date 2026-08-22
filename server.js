const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.static("."));

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PORT = process.env.PORT || 3000;

if (!PAYSTACK_SECRET_KEY) {
  console.warn("Missing PAYSTACK_SECRET_KEY. Add it to your .env file.");
}

app.post("/api/pay", async (req, res) => {
  try {
    const { email, phone } = req.body;
    if (!email || !phone) return res.status(400).json({error:"Email and phone are required."});

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: 200000,
        currency: "KES",
        channels: ["mobile_money", "card"],
        metadata: { product: "IAN XAU Membership", phone }
      },
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
    );

    res.json({ authorization_url: response.data.data.authorization_url });
  } catch (err) {
    res.status(500).json({error: err.response?.data?.message || "Payment initialization failed."});
  }
});

// Verify payment before granting membership.
app.get("/api/verify/:reference", async (req, res) => {
  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(req.params.reference)}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
    );
    const tx = response.data.data;
    res.json({
      paid: tx.status === "success" && tx.amount === 200000 && tx.currency === "KES",
      status: tx.status,
      reference: tx.reference
    });
  } catch {
    res.status(500).json({error:"Verification failed."});
  }
});

// Paystack webhook signature verification.
app.post("/api/paystack-webhook", express.raw({type:"application/json"}), (req, res) => {
  const signature = req.headers["x-paystack-signature"];
  const hash = crypto.createHmac("sha512", PAYSTACK_SECRET_KEY)
    .update(req.body).digest("hex");

  if (signature !== hash) return res.sendStatus(401);

  const event = JSON.parse(req.body.toString());
  if (event.event === "charge.success") {
    // TODO: Save membership in a real database.
    console.log("Successful payment:", event.data.reference);
  }
  res.sendStatus(200);
});

app.listen(PORT, () => console.log(`IAN XAU server running on port ${PORT}`));
