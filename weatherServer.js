const express = require("express");
const path = require("path");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });


const app = express();
const router = express.Router(); // <-- Create router


app.set("view engine", "ejs");
app.set("views", "./templates");
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/templates'));


const port = process.argv[2] || 3000;
const dbName = "CMSC335DB";
const collectionName = process.env.MONGO_COLLECTION || "savedLocations";
const uri = process.env.MONGO_CONNECTION_STRING;


let collection;


(async () => {
  const client = new MongoClient(uri, {
    serverApi: ServerApiVersion.v1,
  });


  try {
    await client.connect();
    const db = client.db(dbName);
    collection = db.collection(collectionName);


    router.get("/", (req, res) => {
      res.render("index");
    });


    router.post("/saveLocation", async (req, res) => {
      // User inputs
      const city = req.body.city;
      const state = req.body.state;
      const country = req.body.country;


      try {
        // Gets the json
        const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${city}&count=10&format=json`);
        const data = await response.json();


        if (data.results) {
          // Try to be more specific using country and possibly state
          let matchedLocations = data.results.filter(loc => loc.country && loc.country.toLowerCase() === country.toLowerCase());


          let matchedLocation;
          if (state !== "" && matchedLocations.length > 0) {
            matchedLocation = matchedLocations.find(loc => loc.admin1 && loc.admin1.toLowerCase() === state.toLowerCase());
          } else {
            matchedLocation = matchedLocations[0];
          }


          if (!matchedLocation) {
            return res.render("rejected");
          }


          //  Gets the values that were matched. Sometimes the name is different for some reason
          const { latitude, longitude, name } = matchedLocation;


          await collection.updateOne(
            { name, state, country },
            { $set: { name, state, country, latitude, longitude } },
            { upsert: true }
          );


          res.render("accepted"); // Maybe add something to say addition was successful
        } else {
          res.render("rejected");
        }


      } catch (err) {
        console.error("Error saving location:", err);
        res.status(404).send("Failed to save location.");
      }
    });


    router.get("/getWeather", async (req, res) => {
      try {
        const locations = await collection.find().toArray();
        let list = "";


        // Use the api to get the weather at each place
        const weatherDataPromises = locations.map(async (loc) => {
          const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m&temperature_unit=fahrenheit`);
          const data = await response.json();
          return { name: loc.name, state: loc.state, country: loc.country, weather: data.current.temperature_2m };
        });


        const weatherData = await Promise.all(weatherDataPromises); // Don't get this line


        if (weatherData.length > 0) {
          // Put all the info into a ul
          list = `<ul>${weatherData.map(app => {
            return app.state !== ""
              ? `<li>${app.name}, ${app.state}: ${app.weather} °F</li>`
              : `<li>${app.name}, ${app.country}: ${app.weather} °F</li>`;
          }).join("")}</ul>`;
        } else {
          list = "<p>No saved locations yet.</p>";
        }


        res.render("weatherResults", { list });
      } catch (err) {
        console.error("Error fetching weather:", err);
        res.status(404).send("Failed to retrieve weather.");
      }
    });


    router.post("/removeAll", async (req, res) => {
      try {
        const result = await collection.deleteMany({});
        const deleted = result.deletedCount;
        res.render("remove", { numbers: deleted });
      } catch (err) {
        res.status(404).send("Error clearing applications");
      }
    });


    app.use("/", router);

    app.listen(port, () => {
      console.log(`Server is running on port http://localhost:${port}`);
      console.log("Stop to shutdown the server: ");
      process.stdin.setEncoding("utf-8");


      process.stdin.on("readable", (input) => {
        while ((input = process.stdin.read()) != null) {
          input = input.toLowerCase().trim();


          if (input === "stop") {
            console.log("Shutting down the server");
            process.exit(0);
          } else {
            console.log("Stop to shutdown the server: ");
          }
        }
      });
    });
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
  }
})();


