const { sendImageToCloudinary } = require("../../utils/cloudnary");
const User = require("../user/user.model");
const fs = require("fs");
const Business = require("./business.model");
const ReviewModel = require("../review/review.model");
const PictureModel = require("../picture/picture.model");
const ClaimBussiness = require("../claimBussiness/claimBussiness.model");
const getTimeRange = require("../../utils/getTimeRange");
const SavedBusinessModel = require("../savedBusiness/SavedBusiness.model");
const Notification = require("../notification/notification.model");

exports.createBusiness = async (req, res) => {
  try {
    const { email, userType } = req.user;
    const {
      services,
      businessInfo,
      businessHours,
      longitude,
      latitude,
      musicLessons,
      ...rest
    } = req.body;

    const files = req.files;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const ownerField = userType === "admin" ? "adminId" : "user";

    let image = [];
    if (files && Array.isArray(files) && files.length > 0) {
      image = await Promise.all(
        files.map(async (file) => {
          const imageName = `business/${Date.now()}_${file.originalname}`;
          const result = await sendImageToCloudinary(imageName, file.path);
          return result.secure_url;
        })
      );
    }

    const business = await Business.create({
      ...rest,
      [ownerField]: user._id,
      businessInfo: { ...businessInfo, image },
      services,
      musicLessons,
      businessHours,
      longitude,
      latitude,
    });

    return res.status(201).json({
      success: true,
      message: "Business created successfully",
      business,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.getAllBusinesses = async (req, res) => {
  try {
    const {
      instrumentFamily,
      selectInstrument,
      serviceName,
      offer, // corresponds to category in services
      priceMin,
      priceMax,
      priceSort, // "lowToHigh", "highToLow"
      openNow, // "true"
      sortByCreatedAt, // "asc" | "desc"
      page = 1,
      limit = 10,
    } = req.query;

    const pageNumber = Math.max(1, parseInt(page));
    const pageSize = Math.max(1, parseInt(limit));

    const query = {};

    // Services filter
    const serviceFilters = {};

    if (instrumentFamily) serviceFilters.instrumentFamily = instrumentFamily;
    if (selectInstrument) serviceFilters.instrumentType = selectInstrument;
    if (serviceName) serviceFilters.name = serviceName;
    if (offer) serviceFilters.category = offer;

    if (priceMin || priceMax) {
      serviceFilters.$or = [
        {
          pricingType: "exact",
          price: {},
        },
        {
          pricingType: "range",
          price: {},
        },
      ];

      if (priceMin) {
        serviceFilters.$or[0].price.$gte = Number(priceMin);
        serviceFilters.$or[1].price.min = { $gte: Number(priceMin) };
      }
      if (priceMax) {
        serviceFilters.$or[0].price.$lte = Number(priceMax);
        serviceFilters.$or[1].price.max = { $lte: Number(priceMax) };
      }
    }

    if (Object.keys(serviceFilters).length > 0) {
      query.services = { $elemMatch: serviceFilters };
    }

    // Open now filter
    if (openNow === "true") {
      const now = new Date();
      const daysOfWeek = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
      ];
      const currentDay = daysOfWeek[now.getDay()];
      const currentTime = now.toTimeString().slice(0, 5);

      query.businessHours = {
        $elemMatch: {
          day: currentDay,
          closed: false,
          open: { $lte: currentTime },
          close: { $gte: currentTime },
        },
      };
    }

    // Sort options
    const sortObj = {};
    if (sortByCreatedAt) {
      sortObj.createdAt = sortByCreatedAt.toLowerCase() === "asc" ? 1 : -1;
    }

    // Get total count (before skip/limit)
    const totalCount = await Business.countDocuments(query);
    const totalPages = Math.ceil(totalCount / pageSize);

    // Query businesses with pagination & sort
    let businesses = await Business.find(query)
      .sort(sortObj)
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize);

    // Re-filter on price (nested & complex case) after DB query if needed
    if (priceMin || priceMax) {
      businesses = businesses.filter((business) =>
        business.services.some((service) => {
          if (service.pricingType === "exact") {
            if (priceMin && service.price < Number(priceMin)) return false;
            if (priceMax && service.price > Number(priceMax)) return false;
            return true;
          } else if (service.pricingType === "range") {
            if (priceMin && service.price.min < Number(priceMin)) return false;
            if (priceMax && service.price.max > Number(priceMax)) return false;
            return true;
          }
          return false;
        })
      );
    }

    // Sort by price lowToHigh / highToLow
    if (priceSort === "lowToHigh") {
      businesses.sort((a, b) => {
        const aMin = Math.min(
          ...a.services.map((s) =>
            s.pricingType === "exact"
              ? s.price
              : s.price.min ?? Number.MAX_SAFE_INTEGER
          )
        );
        const bMin = Math.min(
          ...b.services.map((s) =>
            s.pricingType === "exact"
              ? s.price
              : s.price.min ?? Number.MAX_SAFE_INTEGER
          )
        );
        return aMin - bMin;
      });
    } else if (priceSort === "highToLow") {
      businesses.sort((a, b) => {
        const aMax = Math.max(
          ...a.services.map((s) =>
            s.pricingType === "exact" ? s.price : s.price.max ?? 0
          )
        );
        const bMax = Math.max(
          ...b.services.map((s) =>
            s.pricingType === "exact" ? s.price : s.price.max ?? 0
          )
        );
        return bMax - aMax;
      });
    }

    return res.status(200).json({
      success: true,
      message: "Businesses fetched successfully",
      data: businesses,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        totalPages,
        totalCount,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.getBusinessById = async (req, res) => {
  try {
    const { businessId } = req.params;

    const business = await Business.findById(businessId)
      .populate("services")
      .populate("musicLessons")
      .populate("user", "name email")
      .populate("adminId", "name email")
      .populate("review");

    if (!business) {
      throw new Error("Business not found");
    }

    return res.status(200).json({
      success: true,
      message: "Business fetched successfully",
      data: business,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

exports.getBusinessesByUser = async (req, res) => {
  try {
    const { userId } = req.user;

    const isExist = await User.findById({ _id: userId });
    if (!isExist) {
      return res.status(404).json({
        status: false,
        message: "User not found.",
      });
    }

    const businesses = await Business.find({ userId });

    return res.status(200).json({
      success: true,
      message: "Your businesses fetched successfully",
      data: businesses,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getMyApprovedBusinesses = async (req, res) => {
  try {
    const { email } = req.user;
    console.log("Fetching approved businesses for user:", email);
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    const businesses = await Business.find({
      user: user._id,
      status: "approved",
    });
    if (!businesses) {
      return res.status(404).json({
        success: false,
        message: "No businesses found for this user",
      });
    }
    return res.status(200).json({
      success: true,
      message: "Your businesses fetched successfully",
      data: businesses,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.getDashboardData = async (req, res) => {
  try {
    const { range = "day" } = req.query;

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    if (range === "week") {
      start.setDate(start.getDate() - 7);
    } else if (range === "month") {
      start.setDate(1);
    }

    // Helper to count total and new
    const countData = async (Model, extraFilter = {}) => {
      const total = await Model.countDocuments(extraFilter);
      const newCount = await Model.countDocuments({
        ...extraFilter,
        createdAt: { $gte: start },
      });
      return { total, new: newCount };
    };

    const businesses = await countData(Business);
    const reviews = await countData(ReviewModel);
    const photos = await countData(PictureModel);
    const claims = await countData(ClaimBussiness);
    const users = await countData(User);

    const businessSubmissions = await countData(Business, {
      status: "pending",
    });
    const reviewSubmissions = await countData(ReviewModel, {
      status: "pending",
    });
    const photoSubmissions = await countData(PictureModel, {
      status: "pending",
    });
    const claimRequests = await countData(ClaimBussiness, {
      status: "pending",
    });
    const profilesUnderReview = await countData(User, {
      status: "pending",
    });

    const dashboardData = {
      businesses,
      reviews,
      photos,
      claims,
      users,
      businessSubmissions,
      reviewSubmissions,
      photoSubmissions,
      claimRequests,
      profilesUnderReview,
    };

    return res.status(200).json({
      success: true,
      message: "Dashboard data get successfully",
      data: dashboardData,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.getBusinessmanDashboardData = async (req, res) => {
  try {
    const { range = "day" } = req.query;
    const { userId } = req.user;

    if (req.user.userType !== "businessMan") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Step 1: Find all businesses owned by the user
    const businesses = await Business.find({ user: userId }).select(
      "_id businessInfo.name"
    );
    const savedBusiness = await SavedBusinessModel.find({
      user: userId,
    }).select("_id savedBusiness businessInfo.name");
    const businessIds = businesses.map((b) => b._id);
    const savedBusinessIds = savedBusiness.map((b) => b.savedBusiness);
    console.log(savedBusinessIds);

    const startDate = getTimeRange(range);

    const queryWithDate = { $gte: startDate };
    const [totalReviews, totalPhotos, totalSaves, recentReviews] =
      await Promise.all([
        // Only reviews of my businesses
        ReviewModel.countDocuments({
          business: { $in: businessIds },
          createdAt: queryWithDate,
        }),

        ReviewModel.countDocuments({
          business: { $in: businessIds },
          createdAt: queryWithDate,
          reviewImage: { $exists: true, $ne: [] },
        }),
        // Only photos for my businesses
        // PictureModel.countDocuments({
        //   business: { $in: businessIds },
        //   createdAt: queryWithDate,
        // }),

        SavedBusinessModel.countDocuments({
          savedBusiness: { $in: savedBusinessIds },
          user: userId,
          createdAt: queryWithDate,
        }),
        // Fetch latest reviews for my businesses
        ReviewModel.find({
          business: { $in: businessIds },
          createdAt: queryWithDate,
        })
          .populate("user", "name profilePhoto")
          .populate("business", "businessInfo.name")
          .sort({ createdAt: -1 })
          .limit(5),
      ]);

    return res.status(200).json({
      success: true,
      message: `Dashboard data (${range}) for businessman`,
      data: {
        reviews: totalReviews,
        photos: totalPhotos,
        saves: totalSaves,
        latestReviews: recentReviews.map((r) => ({
          id: r._id,
          rating: r.rating,
          comment: r.comment,
          date: r.createdAt,
          user: {
            name: r.user?.name,
            profilePhoto: r.user?.profilePhoto || null,
          },
          business: {
            id: r.business?._id,
            name: r.business?.businessInfo?.name || "N/A",
          },
        })),
      },
    });
  } catch (error) {
    console.error("Dashboard Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllBusinessesByAdmin = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      businessType,
      time = "all",
      sortBy = "latest",
    } = req.query;

    const pageNumber = Math.max(1, parseInt(page));
    const pageSize = Math.max(1, parseInt(limit));

    const filter = {};
    const sortOption = {};

    if (
      businessType &&
      ["pending", "approved", "rejected"].includes(businessType.toLowerCase())
    ) {
      filter.status = businessType.toLowerCase();
    }

    if (time && ["last-7", "last-30"].includes(time)) {
      const now = new Date();
      let fromDate = new Date();

      if (time === "last-7") {
        fromDate.setDate(now.getDate() - 7);
      } else if (time === "last-30") {
        fromDate.setDate(now.getDate() - 30);
      }

      filter.createdAt = { $gte: fromDate };
    }

    let businessesQuery = Business.find(filter)
      .select("businessInfo user status createdAt")
      .populate("user", "name email");

    if (["latest", "oldest"].includes(sortBy)) {
      sortOption.createdAt = sortBy === "latest" ? -1 : 1;
    } else if (sortBy === "A-Z") {
      sortOption["businessInfo.name"] = 1;
      businessesQuery = businessesQuery.collation({
        locale: "en",
        strength: 2,
      });
    } else if (sortBy === "Z-A") {
      sortOption["businessInfo.name"] = -1;
      businessesQuery = businessesQuery.collation({
        locale: "en",
        strength: 2,
      });
    }

    const totalCount = await Business.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / pageSize);

    if (sortBy === "status") {
      const allBusinesses = await businessesQuery;

      const statusOrder = { pending: 1, approved: 2, rejected: 3 };

      const sortedBusinesses = allBusinesses.sort((a, b) => {
        const statusCompare = statusOrder[a.status] - statusOrder[b.status];
        if (statusCompare !== 0) return statusCompare;

        return a.businessInfo.name.localeCompare(b.businessInfo.name, "en", {
          sensitivity: "base",
        });
      });

      const paginated = sortedBusinesses.slice(
        (pageNumber - 1) * pageSize,
        pageNumber * pageSize
      );

      return res.status(200).json({
        success: true,
        message: "Businesses fetched successfully",
        data: paginated,
        pagination: {
          page: pageNumber,
          limit: pageSize,
          totalPages,
          totalCount,
        },
      });
    }

    const businesses = await businessesQuery
      .sort(sortOption)
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize);

    return res.status(200).json({
      success: true,
      message: "Businesses fetched successfully",
      data: businesses,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        totalPages,
        totalCount,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: error.message,
      error,
    });
  }
};

exports.toggleBusinessStatus = async (req, res) => {
  try {
    const { businessId } = req.params;
    const { status } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be 'approved' or 'rejected'.",
      });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found.",
      });
    }

    business.status = status;
    await business.save();

    return res.status(200).json({
      success: true,
      message: `Business status updated to ${status}`,
      data: business,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
