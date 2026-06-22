async function test() {
  const url = "http://localhost:8081/_serverFn/c551f918ecf843bc05e3ab7779436eb2f6fa6e3731736a708eb1c8d9d2fa1474";
  
  const payload = {
    target: "top_speed_kmh",
    data: {
      brand: ["Abarth", "Abarth"],
      model: ["500e Convertible", "500e Hatchback"],
      top_speed_kmh: [155, 155]
    }
  };

  console.log("Making fetch request with WRAPPED data payload (expected to succeed)...");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        data: payload
      })
    });
    console.log("Response status:", res.status);
    console.log("Response text:", await res.text());
  } catch (e) {
    console.error("Fetch failed:", e);
  }

  console.log("\nMaking fetch request with UNWRAPPED payload (expected to fail)...");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    console.log("Response status:", res.status);
    console.log("Response text:", await res.text());
  } catch (e) {
    console.error("Fetch failed:", e);
  }
}

test();
