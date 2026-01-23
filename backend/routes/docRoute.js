const express = require("express");
const { resolveProductDocs } = require("../services/productResolver");

const router = express.Router();

router.post("/product-docs", (req, res) => {
    try {
        const { product } = req.body;

        const docs = resolveProductDocs(product);

        res.json(docs);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
