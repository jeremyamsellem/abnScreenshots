/**
 * High-Resolution Map Capture Tool
 *
 * This tool captures high-definition map images for specified coordinate areas.
 * Uses a 3x3 grid pattern to ensure full coverage of the defined area.
 *
 * SETUP:
 * 1. Install dependencies: npm install axios sharp
 * 2. That's it! No API keys needed for street maps (geoapify) or satellite (ESRI)
 *
 * USAGE:
 * - Set CONFIG.provider to 'geoapify' for street maps or 'esri' for satellite
 * - Define areas with two lat/lon points in CONFIG.areas array
 * - Set use3x3Grid: true to download center + 8 surrounding areas (recommended)
 * - Run: node index.js
 *
 * OUTPUT:
 * - High-resolution PNG files named: {areaName}_{provider}_zoom{zoom}.png
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

    // Map areas - Define areas using two lat/lon points (southwest and northeast corners)
    // IMPORTANT: Keep areas small! At zoom 18, use ~0.01 degree difference (about 1km)
    areas: [
        {
            name: 'downtown_la',
            point1: { lat: 34.0422, lon: -118.2537 },  // Southwest corner
            point2: { lat: 34.0522, lon: -118.2437 }   // Northeast corner (~1km x 1km)
        }
        // Add more areas as needed:
        // {
        //     name: 'santa_monica',
        //     point1: { lat: 34.014, lon: -118.505 },
        //     point2: { lat: 34.024, lon: -118.495 }
        // }
    ],

    zoom: 18, // Higher = more detail (max ~19 for ESRI, ~20-21 for Mapbox)
    tileSize: 256,

    // Download 3x3 grid (center = defined area, 8 surrounding areas of same size)
    use3x3Grid: true,

    // Maximum tiles to download (safety limit to prevent memory issues)
    // Increase at your own risk if you have more RAM available
    maxTiles: 5000,

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

// ============ BOUNDING BOX CREATION ============
const createBoundingBox = (point1, point2) => {
    // Create bounding box from two points
    // bbox format: [minLon, minLat, maxLon, maxLat]
    const minLon = Math.min(point1.lon, point2.lon);
    const maxLon = Math.max(point1.lon, point2.lon);
    const minLat = Math.min(point1.lat, point2.lat);
    const maxLat = Math.max(point1.lat, point2.lat);

    return [minLon, minLat, maxLon, maxLat];
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
    console.log(`📍 Processing ${CONFIG.areas.length} area(s) at zoom level ${CONFIG.zoom}\n`);

    for (const area of CONFIG.areas) {
        try {
            console.log(`Processing area: ${area.name}...`);

            // Create bounding box from the two points
            const bbox = createBoundingBox(area.point1, area.point2);
            const [minLon, minLat, maxLon, maxLat] = bbox;

            // Log bounding box
            console.log(`Area bbox: [${minLon.toFixed(6)}, ${minLat.toFixed(6)}, ${maxLon.toFixed(6)}, ${maxLat.toFixed(6)}]`);
            console.log(`  Point 1: (${area.point1.lat}, ${area.point1.lon})`);
            console.log(`  Point 2: (${area.point2.lat}, ${area.point2.lon})`);

            // Calculate tile range for the defined area
            const centerMinTileX = long2tile(minLon, CONFIG.zoom);
            const centerMaxTileX = long2tile(maxLon, CONFIG.zoom);
            const centerMinTileY = lat2tile(maxLat, CONFIG.zoom);
            const centerMaxTileY = lat2tile(minLat, CONFIG.zoom);

            const centerNumTilesX = centerMaxTileX - centerMinTileX + 1;
            const centerNumTilesY = centerMaxTileY - centerMinTileY + 1;
            const centerTileCount = centerNumTilesX * centerNumTilesY;

            console.log(`Center area: X[${centerMinTileX} to ${centerMaxTileX}] (${centerNumTilesX} tiles), Y[${centerMinTileY} to ${centerMaxTileY}] (${centerNumTilesY} tiles)`);

            // Calculate total tile count with 3x3 grid
            const totalTileCount = CONFIG.use3x3Grid ? centerTileCount * 9 : centerTileCount;
            const estimatedMemoryMB = Math.round((totalTileCount * TILE_SIZE * TILE_SIZE * 4) / (1024 * 1024));

            // Safety check: prevent downloading too many tiles
            if (totalTileCount > CONFIG.maxTiles) {
                console.error(`\n❌ ERROR: Area too large!`);
                console.error(`   This area requires ${totalTileCount.toLocaleString()} tiles (${centerTileCount.toLocaleString()} center + ${CONFIG.use3x3Grid ? '8 surrounding areas' : 'no grid'})`);
                console.error(`   Maximum allowed: ${CONFIG.maxTiles.toLocaleString()} tiles`);
                console.error(`   Estimated memory needed: ~${estimatedMemoryMB}MB\n`);
                console.error(`Solutions:`);
                console.error(`   1. Reduce area size (move coordinates closer together)`);
                console.error(`   2. Lower zoom level (try 15 or 16 instead of ${CONFIG.zoom})`);
                console.error(`   3. Disable 3x3 grid: set use3x3Grid: false`);
                console.error(`   4. Increase maxTiles limit (if you have enough RAM)`);
                console.error(`\nExample of a reasonable area at zoom 18:`);
                console.error(`   point1: { lat: 34.0522, lon: -118.2437 }`);
                console.error(`   point2: { lat: 34.0622, lon: -118.2337 }  (about 1km x 1km)\n`);
                process.exit(1);
            }

            console.log(`   Estimated tiles: ${totalTileCount.toLocaleString()} (~${estimatedMemoryMB}MB memory)`);

            // Expand to 3x3 grid if enabled
            let minTileX, maxTileX, minTileY, maxTileY;
            if (CONFIG.use3x3Grid) {
                // Add the same width/height on each side to create a 3x3 grid
                minTileX = centerMinTileX - centerNumTilesX;
                maxTileX = centerMaxTileX + centerNumTilesX;
                minTileY = centerMinTileY - centerNumTilesY;
                maxTileY = centerMaxTileY + centerNumTilesY;

                const numTilesX = maxTileX - minTileX + 1;
                const numTilesY = maxTileY - minTileY + 1;

                console.log(`📐 Using 3x3 grid pattern:`);
                console.log(`   Full area: X[${minTileX} to ${maxTileX}] (${numTilesX} tiles), Y[${minTileY} to ${maxTileY}] (${numTilesY} tiles)`);
                console.log(`   Downloading ${numTilesX * numTilesY} tiles (center area + 8 surrounding areas)...`);
            } else {
                minTileX = centerMinTileX;
                maxTileX = centerMaxTileX;
                minTileY = centerMinTileY;
                maxTileY = centerMaxTileY;
                console.log(`Downloading ${centerNumTilesX * centerNumTilesY} tiles...`);
            }

            const numTilesX = maxTileX - minTileX + 1;
            const numTilesY = maxTileY - minTileY + 1;

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

            const outputPath = `./${area.name}_${CONFIG.provider}_zoom${CONFIG.zoom}.png`;
            fs.writeFileSync(outputPath, stitchedImage);
            console.log(`✅ Map for ${area.name} saved to ${outputPath}`);
            console.log(`   Image size: ${numTilesX * TILE_SIZE}x${numTilesY * TILE_SIZE} pixels\n`);
        } catch (error) {
            console.error(`Failed to process ${area.name}:`, error.message);
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
    if (!CONFIG.areas || CONFIG.areas.length === 0) {
        console.error('❌ Error: Please add at least one area to CONFIG.areas');
        console.error('   Each area needs: name, point1 {lat, lon}, point2 {lat, lon}');
        process.exit(1);
    }

    // Validate each area
    for (const area of CONFIG.areas) {
        if (!area.name || !area.point1 || !area.point2) {
            console.error(`❌ Error: Area missing required fields (name, point1, point2)`);
            process.exit(1);
        }
        if (typeof area.point1.lat !== 'number' || typeof area.point1.lon !== 'number' ||
            typeof area.point2.lat !== 'number' || typeof area.point2.lon !== 'number') {
            console.error(`❌ Error: Area "${area.name}" has invalid lat/lon coordinates`);
            process.exit(1);
        }
    }

    // Show attribution for ESRI
    if (CONFIG.provider === 'esri') {
        console.log('📸 Using ESRI World Imagery (FREE satellite imagery)');
        console.log('   Attribution: Powered by Esri\n');
    }
};

validateConfig();
downloadAndStitchMaps();
