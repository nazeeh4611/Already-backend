import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import adminModel from "../Models/adminModel.js";

dotenv.config();

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log("MongoDB Connected for Seeding");

    const existingAdmin = await adminModel.findOne({
      email: "info@alrknalraqy.in",
    });

    if (existingAdmin) {
      console.log("Admin already exists ✅");
      process.exit();
    }

    const hashedPassword = await bcrypt.hash("Alrkn@2026", 10);

    await adminModel.create({
      email: "info@alrknalraqy.in",
      password: hashedPassword,
      number: "+971000000000",
    });

    console.log("Admin seeded successfully 🚀");
    process.exit();
  } catch (error) {
    console.error("Seeding error ❌:", error);
    process.exit(1);
  }
};

seedAdmin();