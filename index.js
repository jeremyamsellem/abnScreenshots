/**
 * High-Resolution Map Capture Tool
 *
 * This tool captures high-definition map images for specified zip codes.
 *
 * SETUP:
 * 1. Install dependencies: npm install axios sharp
 * 2. That's it! ESRI satellite imagery is FREE and requires NO API key or credit card
 *
 * USAGE:
 * - Set CONFIG.provider to 'esri' for FREE satellite imagery (RECOMMENDED)
 * - Or 'mapbox' for satellite (requires credit card), or 'geoapify' for street maps
 * - Add zip codes to CONFIG.zipCodes array
 * - Run: node index.js
 *
 * OUTPUT:
 * - High-resolution PNG files named: {zipCode}_{provider}_zoom{zoom}.png
 */

const axios = require('axios');
const fs = require('fs');
const sharp = require('sharp');

// ============ CONFIGURATION ============
const CONFIG = {
    // Provider options:
    // - 'geoapify' (street map, free) ⭐ DEFAULT
    // - 'esri' (FREE satellite, no credit card required)
    // - 'mapbox' (satellite, requires credit card for free tier)
    provider: 'geoapify',

    // API Keys (only needed for certain providers)
    geoapifyKey: 'bb4c8bd74f714b58909203373fed1f2a',
    mapboxToken: 'YOUR_MAPBOX_TOKEN_HERE', // Only if using mapbox

    // Map settings
    zipCodes: ['07030'],
    zoom: 18, // Higher = more detail (max ~19 for ESRI, ~20-21 for Mapbox)
    tileSize: 256,

    // Bounding box expansion (to ensure full zip code coverage)
    // Value of 0.1 = expand by 10% on each side, 0.2 = 20%, etc.
    bboxExpansion: 0.15, // Expand by 15% to capture full area

    // Geoapify style options: 'osm-carto', 'osm-bright', 'osm-bright-grey', 'klokantech-basic', 'osm-liberty'
    geoapifyStyle: 'osm-carto',

    // Mapbox style options: 'satellite-v9' (pure satellite), 'satellite-streets-v12' (satellite + labels)
    mapboxStyle: 'satellite-v9'
};

// Mapbox @2x tiles are 512x512, regular tiles are 256x256
const TILE_SIZE = CONFIG.provider === 'mapbox' ? 512 : CONFIG.tileSize;

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

// ============ GEOCODING ============
const geocode = async (zipCode) => {
    try {
        const response = await axios.get(`https://api.geoapify.com/v1/geocode/search?text=${zipCode}&type=postcode&apiKey=${CONFIG.geoapifyKey}`);
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

// ============ TILE URL PROVIDERS ============
const getTileUrl = (x, y, zoom) => {
    switch (CONFIG.provider) {
        case 'esri':
            // ESRI World Imagery - FREE, no API key required!
            // Docs: https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer
            // Attribution: "Powered by Esri" (automatically added to console output)
            return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`;

        case 'mapbox':
            // Mapbox Static Tiles API (requires credit card for free tier)
            // Docs: https://docs.mapbox.com/api/maps/static-tiles/
            return `https://api.mapbox.com/v4/mapbox.${CONFIG.mapboxStyle}/${zoom}/${x}/${y}@2x.png?access_token=${CONFIG.mapboxToken}`;

        case 'geoapify':
            // Geoapify Maps API (OpenStreetMap based)
            // Styles: osm-carto, osm-bright, osm-bright-grey, klokantech-basic, osm-liberty
            return `https://maps.geoapify.com/v1/tile/${CONFIG.geoapifyStyle}/${zoom}/${x}/${y}.png?apiKey=${CONFIG.geoapifyKey}`;

        default:
            throw new Error(`Unknown provider: ${CONFIG.provider}`);
    }
};

// ============ TILE DOWNLOADING ============
const getMapTile = async (x, y, zoom) => {
    const url = getTileUrl(x, y, zoom);
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return response.data;
    } catch (error) {
        console.error(`Failed to download tile ${zoom}/${x}/${y} from ${url}`);
        throw new Error(`Failed to download tile ${zoom}/${x}/${y}: ${error.message}`);
    }
};

// ============ MAIN PROCESSING ============
const downloadAndStitchMaps = async () => {
    console.log(`\n🗺️  Map Provider: ${CONFIG.provider.toUpperCase()}`);
    console.log(`📍 Processing ${CONFIG.zipCodes.length} zip code(s) at zoom level ${CONFIG.zoom}\n`);

    for (const zipCode of CONFIG.zipCodes) {
        try {
            console.log(`Processing ${zipCode}...`);
            let { bbox, lon, lat } = await geocode(zipCode);

            if (!bbox || !Array.isArray(bbox) || bbox.length !== 4) {
                console.warn(`Warning: Bounding box not found for ${zipCode}. Creating a default one.`);
                const halfSide = 0.005; // Roughly 0.5km in degrees
                bbox = [lon - halfSide, lat - halfSide, lon + halfSide, lat + halfSide];
            }

            let [minLon, minLat, maxLon, maxLat] = bbox;

            // Log original bounding box
            console.log(`Original bbox: [${minLon.toFixed(6)}, ${minLat.toFixed(6)}, ${maxLon.toFixed(6)}, ${maxLat.toFixed(6)}]`);

            // Expand bounding box to ensure full coverage
            if (CONFIG.bboxExpansion > 0) {
                const lonPadding = (maxLon - minLon) * CONFIG.bboxExpansion;
                const latPadding = (maxLat - minLat) * CONFIG.bboxExpansion;

                minLon -= lonPadding;
                maxLon += lonPadding;
                minLat -= latPadding;
                maxLat += latPadding;

                console.log(`Expanded bbox: [${minLon.toFixed(6)}, ${minLat.toFixed(6)}, ${maxLon.toFixed(6)}, ${maxLat.toFixed(6)}] (${(CONFIG.bboxExpansion * 100).toFixed(0)}% expansion)`);
            }

            const minTileX = long2tile(minLon, CONFIG.zoom);
            const maxTileX = long2tile(maxLon, CONFIG.zoom);
            const minTileY = lat2tile(maxLat, CONFIG.zoom);
            const maxTileY = lat2tile(minLat, CONFIG.zoom);

            const numTilesX = maxTileX - minTileX + 1;
            const numTilesY = maxTileY - minTileY + 1;

            console.log(`Tile range: X[${minTileX} to ${maxTileX}] (${numTilesX} tiles), Y[${minTileY} to ${maxTileY}] (${numTilesY} tiles)`);
            console.log(`Downloading ${numTilesX * numTilesY} tiles for ${zipCode}...`);

            const tilePromises = [];
            for (let y = minTileY; y <= maxTileY; y++) {
                for (let x = minTileX; x <= maxTileX; x++) {
                    tilePromises.push(getMapTile(x, y, CONFIG.zoom));
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

            const outputPath = `./${zipCode}_${CONFIG.provider}_zoom${CONFIG.zoom}.png`;
            fs.writeFileSync(outputPath, stitchedImage);
            console.log(`✅ Map for ${zipCode} saved to ${outputPath}`);
            console.log(`   Image size: ${numTilesX * TILE_SIZE}x${numTilesY * TILE_SIZE} pixels\n`);
        } catch (error) {
            console.error(`Failed to process ${zipCode}:`, error.message);
        }
    }
};

// ============ VALIDATION & START ============
const validateConfig = () => {
    if (CONFIG.provider === 'mapbox' && CONFIG.mapboxToken === 'YOUR_MAPBOX_TOKEN_HERE') {
        console.error('❌ Error: Please set your Mapbox token in CONFIG.mapboxToken');
        console.error('   Get a free token at: https://account.mapbox.com/access-tokens/');
        console.error('   Note: Mapbox requires a credit card even for free tier');
        console.error('   💡 Use provider: "esri" instead for truly free satellite imagery!');
        process.exit(1);
    }
    if (CONFIG.provider === 'geoapify' && !CONFIG.geoapifyKey) {
        console.error('❌ Error: Please set your Geoapify API key in CONFIG.geoapifyKey');
        process.exit(1);
    }
    if (!CONFIG.zipCodes || CONFIG.zipCodes.length === 0) {
        console.error('❌ Error: Please add at least one zip code to CONFIG.zipCodes');
        process.exit(1);
    }

    // Show attribution for ESRI
    if (CONFIG.provider === 'esri') {
        console.log('📸 Using ESRI World Imagery (FREE satellite imagery)');
        console.log('   Attribution: Powered by Esri\n');
    }
};

validateConfig();
downloadAndStitchMaps();
