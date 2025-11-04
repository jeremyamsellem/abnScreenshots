# High-Resolution Map Capture Tool

Automatically capture high-definition satellite or street map images for zip codes by stitching together map tiles.

## Features

- ✅ **Two providers**: Mapbox (satellite imagery) or Geoapify (street maps)
- ✅ **High resolution**: Mapbox uses @2x tiles (512x512) for extra clarity
- ✅ **Batch processing**: Process multiple zip codes at once
- ✅ **Automatic stitching**: Seamlessly combines tiles into one image
- ✅ **Free tier friendly**: Mapbox offers 50,000 tiles/month free

## Setup

### 1. Install Dependencies

```bash
npm install axios sharp
```

### 2. Get API Keys

#### For Mapbox (Satellite Imagery - Recommended)
1. Go to https://account.mapbox.com/
2. Sign up for a free account
3. Navigate to "Access Tokens"
4. Copy your default public token or create a new one
5. Free tier: 50,000 tile requests/month

#### For Geoapify (Street Maps)
- Already configured with the existing API key
- Free tier available

### 3. Configure

Edit `index.js` and update the `CONFIG` object:

```javascript
const CONFIG = {
    provider: 'mapbox',  // or 'geoapify'
    mapboxToken: 'YOUR_MAPBOX_TOKEN_HERE',  // Add your token here
    zipCodes: ['07030', '10001'],  // Add your zip codes
    zoom: 18,  // 18 = high detail, 15 = wider area
    mapboxStyle: 'satellite-v9'  // or 'satellite-streets-v12' for labels
};
```

## Usage

```bash
node index.js
```

The tool will:
1. Geocode each zip code to get coordinates
2. Calculate required map tiles for the area
3. Download all tiles in parallel
4. Stitch them together into a single high-resolution PNG
5. Save as `{zipCode}_{provider}_zoom{zoom}.png`

## Output Examples

- `07030_mapbox_zoom18.png` - Hoboken, NJ in satellite view at zoom 18
- `10001_geoapify_zoom16.png` - NYC in street map view at zoom 16

## Configuration Options

### Provider Options

| Provider | Type | Resolution | Free Tier | Best For |
|----------|------|------------|-----------|----------|
| `mapbox` | Satellite | 512x512 @2x tiles | 50k/month | Aerial photography, satellite view |
| `geoapify` | Street Map | 256x256 tiles | Varies | Street-level detail, roads |

### Zoom Levels

- **15**: City-wide view (~5km coverage)
- **16**: Neighborhood view (~2.5km coverage)
- **17**: Street-level view (~1.2km coverage)
- **18**: High detail (~600m coverage) - **Recommended**
- **19-21**: Extreme detail (limited availability)

Higher zoom = more detail but more tiles = more API calls

### Mapbox Styles

- `satellite-v9` - Pure satellite imagery (clean, no labels)
- `satellite-streets-v12` - Satellite + street labels and roads

## Troubleshooting

### "Invalid API key" Error
- Make sure you've replaced `YOUR_MAPBOX_TOKEN_HERE` with your actual token
- Verify the token is active at https://account.mapbox.com/access-tokens/

### Image Quality Too Low
- Increase the `zoom` level (try 19 or 20)
- Note: Higher zoom may not be available in all areas

### Too Many Tiles / Rate Limit
- Reduce the `zoom` level
- Process fewer zip codes at once
- Mapbox free tier: 50,000 tiles/month

### Missing Dependencies
```bash
npm install axios sharp
```

## How It Works

1. **Geocoding**: Converts zip code to lat/lon coordinates and bounding box
2. **Tile Calculation**: Determines which map tiles cover the area
3. **Parallel Download**: Fetches all tiles simultaneously
4. **Stitching**: Uses Sharp library to composite tiles into one image
5. **Output**: Saves high-resolution PNG

## Example Output

The generated images will show:
- **Mapbox**: High-resolution satellite/aerial photography
- **Geoapify**: Detailed street maps with roads, buildings, labels

Perfect for:
- Property analysis
- Urban planning
- Real estate documentation
- Geographic research
- Area visualization

## API Usage Estimates

For a typical zip code area at zoom 18:
- Small zip code: ~20-50 tiles
- Medium zip code: ~50-150 tiles
- Large zip code: ~150-500 tiles

Mapbox free tier (50,000 tiles/month) can handle ~100-2,500 zip codes depending on size.

## License

MIT
