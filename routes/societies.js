const express = require("express");
const router = express.Router();
const dbConnection = require("../config/database");
const SocietyService = require("../models/services/SocietyService");
const { verifyClerkToken, getUserDetails } = require("../middleware/auth");

/**
 * GET /api/societies
 * Get all active societies for selection
 */
router.get("/", async (req, res) => {
  try {
    const db = dbConnection.getDb();
    const societyService = new SocietyService(db);

    const result = await societyService.getActiveSocieties();

    if (result.success) {
      // Return the array of societies directly for frontend compatibility
      res.json({
        success: true,
        data: result.data || [],
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Failed to fetch societies",
        message: result.message || "Unknown error occurred",
      });
    }
  } catch (error) {
    console.error("Error fetching societies:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * GET /api/societies/:id
 * Get specific society details
 */
router.get("/:id", verifyClerkToken, getUserDetails, async (req, res) => {
  try {
    const { id } = req.params;
    const db = dbConnection.getDb();
    const societyService = new SocietyService(db);

    const result = await societyService.findById(id);

    if (result.success && result.data) {
      res.json(result.data);
    } else {
      res.status(404).json({
        error: "Society not found",
        message: "The requested society does not exist",
      });
    }
  } catch (error) {
    console.error("Error fetching society:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * GET /api/societies/:id/stats
 * Get society statistics (admin only)
 */
router.get("/:id/stats", verifyClerkToken, getUserDetails, async (req, res) => {
  try {
    const { id } = req.params;
    const clerkUserId = req.userId;
    const db = dbConnection.getDb();
    const societyService = new SocietyService(db);

    // Check if user is admin of this society
    const adminCheck = await societyService.isAdmin(id, clerkUserId);
    if (!adminCheck.isAdmin) {
      return res.status(403).json({
        error: "Access denied",
        message: "Only society admins can view statistics",
      });
    }

    const result = await societyService.getSocietyStats(id);

    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({
        error: "Failed to fetch society statistics",
        message: result.message,
      });
    }
  } catch (error) {
    console.error("Error fetching society stats:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * POST /api/societies
 * Create a new society (admin only - for future use)
 */
router.post("/", verifyClerkToken, getUserDetails, async (req, res) => {
  try {
    const societyData = req.body;
    const clerkUserId = req.userId;
    const db = dbConnection.getDb();
    const societyService = new SocietyService(db);

    // Add the creator as the first admin
    societyData.adminUsers = [clerkUserId];
    societyData.createdAt = new Date();
    societyData.updatedAt = new Date();

    const result = await societyService.createSociety(societyData);

    if (result.success) {
      res.status(201).json({
        message: "Society created successfully",
        data: result.data,
      });
    } else {
      res.status(400).json({
        error: "Failed to create society",
        message: result.message,
        errors: result.errors,
      });
    }
  } catch (error) {
    console.error("Error creating society:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

module.exports = router;
