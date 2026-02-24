import mongoose from "mongoose";
import PropertyModel from "../Models/PropertyModel.js";
import BookingModel from "../Models/BookingModel.js";
import locationmodel from "../Models/LocationModel.js";

export const getLocation = async (req, res) => {
  try {
    const locations = await locationmodel
      .find({ status: "active" })
      .select("name _id image")
      .lean();
    
    if (!locations || locations.length === 0) {
      return res.status(404).json({ message: "Location not found" });
    }

    const locationsWithPropertyCount = await Promise.all(
      locations.map(async (location) => {
        const propertyCount = await PropertyModel.countDocuments({
          neighborhood: location._id,
          status: true
        });
        return {
          ...location,
          properties: propertyCount
        };
      })
    );

    res.status(200).json({ success: true, location: locationsWithPropertyCount });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
    console.error(error);
  }
};

export const getproperties = async (req, res) => {
  try {
    const {
      checkin,
      checkout,
      location,
      locationId,
      guests,
      adults,
      children,
      infants,
      priceMin,
      priceMax,
      propertyType,
      bedrooms,
      bathrooms,
      minArea,
      featured,
      recommended,
      page = 1,
      limit = 12,
    } = req.query;

    let baseFilter = { status: true };

    if (featured === 'true') {
      baseFilter.isFeatured = true;
    }

    if (location) {
      baseFilter.location = { $regex: location, $options: "i" };
    }

    if (locationId && mongoose.Types.ObjectId.isValid(locationId)) {
      baseFilter.neighborhood = new mongoose.Types.ObjectId(locationId);
    }

    if (priceMin || priceMax) {
      baseFilter.$or = [
        { 'pricing.night': { $gte: Number(priceMin || 0), $lte: Number(priceMax || Infinity) } },
        { 'pricing.week': { $gte: Number(priceMin || 0), $lte: Number(priceMax || Infinity) } },
        { 'pricing.month': { $gte: Number(priceMin || 0), $lte: Number(priceMax || Infinity) } },
        { 'pricing.year': { $gte: Number(priceMin || 0), $lte: Number(priceMax || Infinity) } }
      ];
    }

    if (propertyType) baseFilter.type = propertyType;
    if (bedrooms) baseFilter.bedrooms = { $gte: Number(bedrooms) };
    if (bathrooms) baseFilter.bathrooms = { $gte: Number(bathrooms) };

    const totalGuests = Number(adults || guests || 0) + Number(children || 0) + Number(infants || 0);
    if (totalGuests > 0) {
      baseFilter.guests = { $gte: totalGuests };
    }

    if (minArea) baseFilter.area = { $gte: Number(minArea) };

    const totalPropertiesInDatabase = await PropertyModel.countDocuments(baseFilter);

    let filter = JSON.parse(JSON.stringify(baseFilter));
    let unavailablePropertyIds = [];
    let hasDateFilter = false;

    if (checkin && checkout) {
      hasDateFilter = true;
    
      const overlappingBookings = await BookingModel.find({
        bookingStatus: "confirmed",
        $or: [
          {
            $and: [
              { checkIn: { $lt: checkout } },
              { checkOut: { $gt: checkin } }
            ]
          }
        ],
      })
        .select("property checkIn checkOut bookingStatus")
        .lean();
    
      const allProperties = await PropertyModel.find({
        'availability.blockedDates': { $exists: true, $ne: [] }
      })
        .select('_id title availability.blockedDates')
        .lean();
    
      const propertiesWithBlockedDates = allProperties.filter(property => {
        if (!property.availability || !property.availability.blockedDates) return false;
        
        return property.availability.blockedDates.some(blocked => {
          const blockedStart = new Date(blocked.startDate);
          const blockedEnd = new Date(blocked.endDate);
          const searchStart = new Date(checkin);
          const searchEnd = new Date(checkout);
          
          return blockedStart < searchEnd && blockedEnd > searchStart;
        });
      });
    
      const bookingPropertyIds = overlappingBookings.map((booking) => booking.property.toString());
      const blockedPropertyIds = propertiesWithBlockedDates.map(p => p._id.toString());
      
      unavailablePropertyIds = [...new Set([...bookingPropertyIds, ...blockedPropertyIds])];
    
      if (unavailablePropertyIds.length > 0) {
        filter._id = { $nin: unavailablePropertyIds.map(id => new mongoose.Types.ObjectId(id)) };
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let sortOption = { createdAt: -1 };
    
    if (recommended === 'true') {
      sortOption = { bookingCount: -1, createdAt: -1 };
    } else if (featured === 'true') {
      sortOption = { featuredOrder: 1, createdAt: -1 };
    }

    const [properties, totalCount] = await Promise.all([
      PropertyModel.find(filter)
        .select(
          "title type pricing bedrooms bathrooms guests area location images propertyHighlights amenities createdAt neighborhood status ratings isFeatured featuredOrder bookingCount"
        )
        .populate("neighborhood", "name")
        .sort(sortOption)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      PropertyModel.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: properties.length,
      totalCount,
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      currentPage: parseInt(page),
      totalPropertiesInDatabase,
      hasDateFilter,
      data: properties,
    });
  } catch (error) {
    console.error("Error fetching properties:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const getproperty = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: "Property ID is required" });
    }
    
    const property = await PropertyModel.findById(id)
      .populate("neighborhood", "name")
      .populate({
        path: "reviews",
        match: { status: "active" },
        options: { sort: "-createdAt", limit: 10 },
        populate: { path: "user", select: "name email" }
      })
      .populate("bookings")
      .lean();
      
    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }
    
    return res.status(200).json({ success: true, property });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getFeaturedProperties = async (req, res) => {
  try {
    const properties = await PropertyModel.find({ 
      status: true, 
      isFeatured: true 
    })
      .select(
        "title type pricing bedrooms bathrooms guests area location images propertyHighlights amenities neighborhood ratings isFeatured featuredOrder"
      )
      .populate("neighborhood", "name")
      .sort({ featuredOrder: 1, createdAt: -1 })
      .limit(12)
      .lean();


    res.status(200).json({
      success: true,
      count: properties.length,
      data: properties,
    });
  } catch (error) {
    console.error("Error fetching featured properties:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const getRecommendedProperties = async (req, res) => {
  try {
    const properties = await PropertyModel.find({ status: true })
      .select(
        "title type pricing bedrooms bathrooms guests area location images propertyHighlights amenities neighborhood ratings bookingCount"
      )
      .populate("neighborhood", "name")
      .sort({ bookingCount: -1, createdAt: -1 })
      .limit(12)
      .lean();

    res.status(200).json({
      success: true,
      count: properties.length,
      data: properties,
    });
  } catch (error) {
    console.error("Error fetching recommended properties:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const toggleFeaturedProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const { isFeatured, featuredOrder } = req.body;

    const property = await PropertyModel.findById(id);
    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    property.isFeatured = isFeatured !== undefined ? isFeatured : !property.isFeatured;
    if (featuredOrder !== undefined) {
      property.featuredOrder = featuredOrder;
    }

    await property.save();

    res.status(200).json({
      success: true,
      message: `Property ${property.isFeatured ? 'featured' : 'unfeatured'} successfully`,
      property
    });
  } catch (error) {
    console.error("Error toggling featured property:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};