
import mongoose from "mongoose";

/* ── Sub-schema: topic interaction data ── */
const topicDataSchema = new mongoose.Schema(
  {
    count:    { type: Number, default: 0 },
    lastSeen: { type: Date,   default: Date.now },
  },
  { _id: false }
);

/* ── Sub-schema: individual search history entry ── */
const searchEntrySchema = new mongoose.Schema(
  {
    query:      { type: String, required: true },
    searchedAt: { type: Date,   default: Date.now },
  },
  { _id: false }
);

/* ── Main preference schema ── */
const preferenceSchema = new mongoose.Schema(
  {
    sessionId: {
      type:     String,
      required: true,
      unique:   true,
      default:  "default",
    },

    /* Selected reader role — matches ROLES in App.js */
    role: {
      type:    String,
      default: "mutual_fund_investor",
      enum: [
        "mutual_fund_investor",
        "trader",
        "startup_founder",
        "student",
        "corporate_executive",
        "sme_owner",
        "real_estate",
        "nri",
        "government_employee",
        "freelancer",
        "farmer",
        "homemaker",
      ],
    },

    /* Manually selected interest tags */
    interests: { type: [String], default: [] },

    /* topic → { count, lastSeen }  — drives "For you" suggestions */
    topicCounts: {
      type:    Map,
      of:      topicDataSchema,
      default: {},
    },

    /* Last 50 searches, newest first, deduplicated */
    searchHistory: {
      type:    [searchEntrySchema],
      default: [],
    },
  },
  { timestamps: true }
);

/* ── Helper static: upsert the single default preferences doc ── */
preferenceSchema.statics.getOrCreate = async function () {
  return this.findOneAndUpdate(
    { sessionId: "default" },
    { $setOnInsert: { sessionId: "default" } },
    { upsert: true, new: true }
  );
};

/* ── Helper static: increment a topic's interaction count ── */
preferenceSchema.statics.trackTopic = async function (topic, action) {
  const prefs = await this.getOrCreate();

  const existing = prefs.topicCounts.get(topic);
  prefs.topicCounts.set(topic, {
    count:    (existing?.count || 0) + 1,
    lastSeen: new Date(),
  });

  if (action === "search") {
    prefs.searchHistory = [
      { query: topic, searchedAt: new Date() },
      ...prefs.searchHistory.filter((s) => s.query !== topic),
    ].slice(0, 50);
  }

  await prefs.save();
  return prefs;
};

/* ── Helper static: top-N suggestions sorted by count ── */
preferenceSchema.statics.getSuggestions = async function (limit = 5) {
  const prefs = await this.getOrCreate();

  return [...prefs.topicCounts.entries()]
    .map(([topic, data]) => ({
      topic,
      count:    data.count,
      lastSeen: data.lastSeen,
    }))
    .sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen)
    .slice(0, limit)
    .map(({ topic, count }) => ({ topic, count }));
};

const Preference = mongoose.model("Preference", preferenceSchema);

export default Preference;