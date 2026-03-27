/**
 * models/Bookmark.js
 */

import mongoose from "mongoose";

const bookmarkSchema = new mongoose.Schema(
  {
    url:         { type: String, required: true, unique: true, trim: true },
    title:       { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    urlToImage:  { type: String, default: "" },
    source:      { type: String, default: "" },
    publishedAt: { type: String, default: "" },
    savedAt:     { type: Date,   default: Date.now },
  },
  { timestamps: true }
);

/* Fast lookup by URL */
bookmarkSchema.index({ url: 1 });
/* Newest-first default sort */
bookmarkSchema.index({ savedAt: -1 });

const Bookmark = mongoose.model("Bookmark", bookmarkSchema);

export default Bookmark;