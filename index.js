const axios = require('axios');
const fs = require('fs');
const sharp = require('sharp');

const API_KEY = 'bb4c8bd74f714b58909203373fed1f2a'; // Replace with your Geoapify API key
const zipCodes = ['07030'];
const zoom = 18;
const TILE_SIZE = 256;

// Function to convert longitude and latitude to tile numbers
function long2tile(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function lat2tile(lat, zoom) {
  return Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
      Math.pow(2, zoom)
  );
}

const geocode = async (zipCode) => {
    try {
        const response = await axios.get(`https://api.geoapify.com/v1/geocode/search?text=${zipCode}&type=postcode&apiKey=${API_KEY}`);
        if (response.data.features.length === 0) {
            throw new Error('No results found');
        }
        const { lon, lat, bbox } = response.data.features[0].properties;
        return { lon, lat, bbox };
    } catch (error) {
        if (error.response && error.response.status === 401) {
            throw new Error('Invalid API key');
        }
        throw new Error(`Geocoding failed for ${zipCode}: ${error.message}`);
    }
};

const getMapTile = async (x, y, zoom) => {
    const url = `https://maps.geoapify.com/v1/tile/osm-carto/${zoom}/${x}/${y}.png?apiKey=${API_KEY}`;
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return response.data;
    } catch (error) {
        throw new Error(`Failed to download tile ${zoom}/${x}/${y}: ${error.message}`);
    }
};

const downloadAndStitchMaps = async () => {
    for (const zipCode of zipCodes) {
        try {
            console.log(`Processing ${zipCode}...`);
            let { bbox, lon, lat } = await geocode(zipCode);

            if (!bbox || !Array.isArray(bbox) || bbox.length !== 4) {
                console.warn(`Warning: Bounding box not found for ${zipCode}. Creating a default one.`);
                const halfSide = 0.005; // Roughly 0.5km in degrees
                bbox = [lon - halfSide, lat - halfSide, lon + halfSide, lat + halfSide];
            }

            const [minLon, minLat, maxLon, maxLat] = bbox;

            const minTileX = long2tile(minLon, zoom);
            const maxTileX = long2tile(maxLon, zoom);
            const minTileY = lat2tile(maxLat, zoom);
            const maxTileY = lat2tile(minLat, zoom);

            const numTilesX = maxTileX - minTileX + 1;
            const numTilesY = maxTileY - minTileY + 1;

            console.log(`Downloading ${numTilesX * numTilesY} tiles for ${zipCode}...`);

            const tilePromises = [];
            for (let y = minTileY; y <= maxTileY; y++) {
                for (let x = minTileX; x <= maxTileX; x++) {
                    tilePromises.push(getMapTile(x, y, zoom));
                }
            }

            const tileBuffers = await Promise.all(tilePromises);

            const compositeOptions = [];
            for (let y = minTileY; y <= maxTileY; y++) {
                for (let x = minTileX; x <= maxTileX; x++) {
                    const i = (y - minTileY) * numTilesX + (x - minTileX);
                    compositeOptions.push({
                        input: tileBuffers[i],
                        left: (x - minTileX) * TILE_SIZE,
                        top: (y - minTileY) * TILE_SIZE,
                    });
                }
            }

            const stitchedImage = await sharp({
                create: {
                    width: numTilesX * TILE_SIZE,
                    height: numTilesY * TILE_SIZE,
                    channels: 4,
                    background: { r: 0, g: 0, b: 0, alpha: 0 },
                },
            })
                .composite(compositeOptions)
                .png()
                .toBuffer();

            const outputPath = `./${zipCode}_stitched.png`;
            fs.writeFileSync(outputPath, stitchedImage);
            console.log(`Map for ${zipCode} saved to ${outputPath}`);
        } catch (error) {
            console.error(`Failed to process ${zipCode}:`, error.message);
        }
    }
};

downloadAndStitchMaps();
