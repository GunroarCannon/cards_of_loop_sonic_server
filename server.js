// // Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const solanaWeb3 = require('@solana/web3.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to Solana devnet
const connection = new solanaWeb3.Connection(
  "https://api.devnet.solana.com",
  "confirmed"
);

// Load treasurer wallet from environment variable
const treasurerPrivateKey = process.env.TREASURER_PRIVATE_KEY.split(',').map(Number);
const treasurerWallet = solanaWeb3.Keypair.fromSecretKey(Uint8Array.from(treasurerPrivateKey));

// Store player data (in-memory for simplicity; use a database in production)
const players = {};

// Endpoint to connect wallet
app.post("/connectWallet", async (req, res) => {
  const { walletAddress } = req.body;

  // Step 1: Validate the wallet address
  if (!solanaWeb3.PublicKey.isOnCurve(walletAddress)) {
    return res.status(400).send("Invalid wallet address.");
  }

  // Step 2: Check if the wallet is funded
  try {
    const accountInfo = await connection.getAccountInfo(new solanaWeb3.PublicKey(walletAddress));

    if (!accountInfo) {
      return res.status(400).send("Wallet not found or not funded.");
    }

    // Step 3: Check if the wallet already exists in the players object
    if (players[walletAddress]) {
      return res.status(400).send("Wallet already connected.");
    }

    // Step 4: Add the wallet to the players object
    players[walletAddress] = {
      score: 0,
      balance: accountInfo.lamports / solanaWeb3.LAMPORTS_PER_SOL, // Convert lamports to SOL
    };

    console.log("Wallet connected:", walletAddress);
    res.send({ message: "Wallet connected successfully.", walletAddress });
  } catch (err) {
    console.error("Error fetching account info:", err);
    res.status(500).send("Failed to validate wallet.");
  }
});

// Endpoint to update score and reward tokens
app.post("/updateScore", async (req, res) => {
  const { walletAddress, score } = req.body;

  // Validate wallet address
  if (!players[walletAddress]) {
    return res.status(400).send("Wallet not connected.");
  }

  // Update player's score
  players[walletAddress].score += score;

  // Reward player with tokens (1 token per score point)
  const rewardAmount = score * 1; // 1 token per point
  const rewardLamports = rewardAmount * solanaWeb3.LAMPORTS_PER_SOL;

  // Create a transaction to send tokens
  const rewardTransaction = new solanaWeb3.Transaction().add(
    solanaWeb3.SystemProgram.transfer({
      fromPubkey: treasurerWallet.publicKey, // Treasury wallet
      toPubkey: new solanaWeb3.PublicKey(walletAddress), // Player's wallet
      lamports: rewardLamports,
    })
  );

  try {
    // Sign and send the transaction
    const signature = await solanaWeb3.sendAndConfirmTransaction(
      connection,
      rewardTransaction,
      [treasurerWallet]
    );

    // Update player's balance
    players[walletAddress].balance += rewardAmount;

    console.log(`Score updated: ${players[walletAddress].score}. Tokens rewarded: ${rewardAmount}.`);
    res.send({
      message: `Score updated: ${players[walletAddress].score}. Tokens rewarded: ${rewardAmount}.`,
      signature,
    });
  } catch (err) {
    console.error("Failed to send transaction:", err);
    res.status(500).send("Failed to reward tokens.");
  }
});

// Endpoint to check wallet balance
app.get("/walletBalance/:walletAddress", async (req, res) => {
  const { walletAddress } = req.params;

  // Validate wallet address
  if (!players[walletAddress]) {
    return res.status(400).send("Wallet not connected.");
  }

  try {
    // Fetch wallet balance from Solana
    const balance = await connection.getBalance(new solanaWeb3.PublicKey(walletAddress));
    res.send({
      walletAddress,
      balance: balance / solanaWeb3.LAMPORTS_PER_SOL, // Convert lamports to SOL
    });
  } catch (err) {
    console.error("Failed to fetch balance:", err);
    res.status(500).send("Failed to fetch wallet balance.");
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
