import React, { useRef, useState } from "react";
import "./App.css";
import axios from "axios";

function App() {
  const [selectedProducts, setSelectedProducts] = useState([]);
  const fileInputRef = useRef(null);
  const [message, setMessage] = useState("");

  const products = [
    "Route",
    "Subscription",
    "Smart Collect",
    "Charge at Will",
    "Standard Checkout",
    "Custom Checkout",
    "S2S"
  ];

  const openFilePicker = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Allowed Excel MIME types
    const validTypes = [
      "application/vnd.ms-excel", // .xls
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" // .xlsx
    ];

    if (!validTypes.includes(file.type)) {
      setMessage("Please select an Excel file only (.xls or .xlsx)");
      return;
    }

    const formData = new FormData();
    formData.append("checklist", file);

    try {
      const res = await axios.post(
        "http://localhost:5001/upload",
        formData
      );
      setMessage(res.data.message);
    } catch (error) {
      setMessage("Upload failed");
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
