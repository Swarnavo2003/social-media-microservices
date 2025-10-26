const Post = require("../models/post.model");
const logger = require("../utils/logger");
const { validateCreatePost } = require("../utils/validation");

async function invalidatePostCache(req, input) {
  if (input) {
    const cachedKey = `post:${input}`;
    await req.redisClient.del(cachedKey);
  }

  const keys = await req.redisClient.keys("posts:*");
  if (keys.length > 0) {
    await req.redisClient.del(keys);
    logger.info("Invalidated post cache keys: %o", keys);
  }
}

const createPost = async (req, res) => {
  logger.info("Create Post Endpoint hit");
  try {
    const { error } = validateCreatePost(req.body);
    if (error) {
      logger.warn(
        "Validation error during post creation: %s",
        error.details[0].message
      );
      return res
        .status(400)
        .json({ success: false, message: error.details[0].message });
    }
    const { content, mediaIds } = req.body;
    const newlyCreatedPost = new Post({
      user: req.user.userId,
      content,
      mediaIds: mediaIds || [],
    });

    await newlyCreatedPost.save();
    await invalidatePostCache(req, newlyCreatedPost._id.toString());
    logger.info("Post created with ID: %s", newlyCreatedPost._id);
    res.status(201).json({
      success: true,
      message: "Post created successfully",
      post: newlyCreatedPost,
    });
  } catch (error) {
    logger.error("Error creating post: %o", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getAllPosts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const startIndex = (page - 1) * limit;

    const cacheKey = `posts:${page}:${limit}`;
    const cachedPosts = await req.redisClient.get(cacheKey);

    if (cachedPosts) {
      logger.info("Serving posts from cache for key: %s", cacheKey);
      return res.status(200).json(JSON.parse(cachedPosts));
    }

    const posts = await Post.find({})
      .sort({ createdAt: -1 })
      .skip(startIndex)
      .limit(limit);

    const total = await Post.countDocuments();
    const response = {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      posts,
    };

    await req.redisClient.setex(cacheKey, 3600, JSON.stringify(response));
    logger.info("Posts cached with key: %s", cacheKey);

    res.status(200).json(response);
  } catch (error) {
    logger.error("Error fetching posts: %o", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getPostById = async (req, res) => {
  try {
    const postId = req.params.id;
    const cacheKey = `post:${postId}`;
    const cachedPost = await req.redisClient.get(cacheKey);

    if (cachedPost) {
      logger.info("Serving post from cache for key: %s", cacheKey);
      return res.status(200).json(JSON.parse(cachedPost));
    }

    const singlePostDetailsById = await Post.findById(postId);
    if (!singlePostDetailsById) {
      logger.warn("Post not found with ID: %s", postId);
      return res
        .status(404)
        .json({ message: "Post not found", success: false });
    }

    await req.redisClient.setex(
      cacheKey,
      3600,
      JSON.stringify(singlePostDetailsById)
    );

    res.status(200).json({ post: singlePostDetailsById });
  } catch (error) {
    logger.error("Error fetching post by ID: %o", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updatePost = async (req, res) => {
  try {
  } catch (error) {
    logger.error("Error updating post: %o", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const deletePost = async (req, res) => {
  const post = await Post.findOneAndDelete({
    _id: req.params.id,
    user: req.user.userId,
  });

  if (!post) {
    logger.warn(
      "Post not found or unauthorized delete attempt for ID: %s",
      req.params.id
    );
    return res.status(404).json({ message: "Post not found", success: false });
  }

  await invalidatePostCache(req, req.params.id);

  res.status(200).json({ message: "Post deleted successfully", success: true });
  try {
  } catch (error) {
    logger.error("Error deleting post: %o", error);
    res.status(500).json({ message: "Error deleting post" });
  }
};

module.exports = {
  createPost,
  getAllPosts,
  getPostById,
  updatePost,
  deletePost,
};
