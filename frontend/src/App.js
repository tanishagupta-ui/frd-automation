import React, { useRef, useState } from "react";
import "./App.css";
import axios from "axios";

function App() {
  const [selectedProducts, setSelectedProducts] = useState([]);
  const fileInputRef = useRef(null);
  const [message, setMessage] = useState("");

  const products = [
    "Route",
    "Subscriptions",
    "QR Code",
    "NCApps",
    "Affordability Widget",
    "Smart Collect",
    "Charge at Will",
    "Standard Checkout",
    "Custom Checkout",
    "S2S",
    "Payment Links"
  ];

  const openFilePicker = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = async (e) => {
    setMessage(""); // Clear previous messages
    const file = e.target.files[0];
    if (!file) return;

    console.log("File selected:", file.name, "Type:", file.type);
    console.log("Selected Products:", selectedProducts);

    // Allowed Excel MIME types
    const validTypes = [
      "application/vnd.ms-excel", // .xls
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "" // specific case for some systems where mimetype is empty
    ];

    // Check by extension if mimetype is empty or generic
    const isExcelExtension = file.name.endsWith(".xls") || file.name.endsWith(".xlsx");

    if (!validTypes.includes(file.type) && !isExcelExtension) {
      console.warn("Invalid file type:", file.type);
      setMessage(`Invalid file type: ${file.type}. Please use .xls or .xlsx`);
      return;
    }

    if (selectedProducts.length === 0) {
      setMessage("Please select a product before uploading.");
      return;
    }

    const formData = new FormData();
    // Append product sent FIRST for multer stability
    formData.append("product", selectedProducts[0]);
    formData.append("checklist", file);

    try {
      const res = await axios.post(
        "http://localhost:5001/upload",
        formData
      );
      console.log("Upload response:", res.data);
      setMessage(res.data.message);
    } catch (error) {
      console.error("Upload error:", error);
      setMessage(error.response?.data?.message || "Upload failed");
    }
  };

  const toggleProduct = (product) => {
    if (selectedProducts.includes(product)) {
      setSelectedProducts(selectedProducts.filter((p) => p !== product));
    } else {
      setSelectedProducts([...selectedProducts, product]);
    }
  };

  const handleCheckout = () => {
    if (selectedProducts.length === 0) {
      alert("Please select at least one product.");
      return;
    }
    console.log("Proceeding to checkout with:", selectedProducts);
    alert(`Checkout initiated for: ${selectedProducts.join(", ")}`);
    // Logic for checkout integration goes here
  };

  return (
    <div className="app-container">
      <div className="section">
        <h2>FRD Automation</h2>

        {/* Hidden input */}
        <input
          type="file"
          accept=".xls,.xlsx"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {/* Upload Button */}
        <button className="upload-btn" onClick={openFilePicker}>
          Upload Checklist
        </button>

        <p className="message">{message}</p>
      </div>

      <div className="section">
        <h2>Select Products</h2>
        <div className="product-grid">
          {products.map((product) => (
            <div
              key={product}
              className={`product-chip ${selectedProducts.includes(product) ? "selected" : ""
                }`}
              onClick={() => toggleProduct(product)}
            >
              {product}
            </div>
          ))}
        </div>

        <button
          className="checkout-btn"
          onClick={handleCheckout}
          disabled={selectedProducts.length === 0}
        >
          Checkout
        </button>
      </div>
    </div>
  );
}

export default App;
