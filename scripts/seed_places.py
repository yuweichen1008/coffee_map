import os
import time
from dotenv import load_dotenv
import googlemaps
from supabase import create_client, Client

# Load environment variables from .env.local
load_dotenv(dotenv_path='../.env.local')

# Configuration
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")

if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY, GOOGLE_MAPS_API_KEY]):
    raise ValueError("Missing required environment variables.")

# Initialize clients
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
gmaps = googlemaps.Client(key=GOOGLE_MAPS_API_KEY)

taipei_districts = {
    'Da\'an': {'lat': 25.026, 'lng': 121.543},
    'Xinyi': {'lat': 25.0348, 'lng': 121.5677},
    'Wanhua': {'lat': 25.026285, 'lng': 121.497032},
    'Datong': {'lat': 25.063, 'lng': 121.511},
    'Zhongzheng': {'lat': 25.03236, 'lng': 121.51827},
    'Songshan': {'lat': 25.055, 'lng': 121.554},
    'Zhongshan': {'lat': 25.05499, 'lng': 121.52540},
    'Neihu': {'lat': 25.0667, 'lng': 121.5833},
    'Wenshan': {'lat': 24.9897, 'lng': 121.5722},
    'Nangang': {'lat': 25.03843, 'lng': 121.621825},
    'Shilin': {'lat': 25.0833, 'lng': 121.5170},
    'Beitou': {'lat': 25.1167, 'lng': 121.5000},
}

def seed_places():
    """
    Seeds coffee shops from Taipei districts into the Supabase 'places' table.
    """
    all_places = []
    for district, coords in taipei_districts.items():
        print(f"Fetching coffee shops in {district}...")
        places_result = gmaps.places_nearby(
            location=(coords['lat'], coords['lng']),
            radius=2000,  # 2km radius to get good coverage
            keyword='coffee shop',
            language='en'
        )

        district_places = []
        for place in places_result.get('results', []):
            # Ensure we have at least 10 places per district
            if len(district_places) >= 10:
                break
            
            # Basic place info
            place_data = {
                'name': place.get('name'),
                'address': place.get('vicinity'),
                'lat': place.get('geometry', {}).get('location', {}).get('lat'),
                'lng': place.get('geometry', {}).get('location', {}).get('lng'),
                'google_place_id': place.get('place_id'),
                'category': 'cafe',
                'source': 'google_maps_api'
            }
            
            # Add to list if it has essential data
            if all(place_data.values()):
                district_places.append(place_data)
        
        all_places.extend(district_places)
        print(f"Found {len(district_places)} coffee shops in {district}.")
        time.sleep(2) # To avoid hitting API rate limits

    if not all_places:
        print("No places found to seed.")
        return

    print(f"\nUpserting {len(all_places)} places to Supabase...")
    try:
        # Upsert based on google_place_id to avoid duplicates
        data, count = supabase.table('places').upsert(
            all_places, 
            on_conflict='google_place_id'
        ).execute()
        
        print(f"Successfully upserted {len(data[1])} places.")
    except Exception as e:
        print(f"An error occurred during upsert: {e}")

if __name__ == "__main__":
    seed_places()
