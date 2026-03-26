import os
import time
from datetime import datetime
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

def get_oldest_review_date(place_id: str) -> str | None:
    """
    Fetches reviews for a place and returns the oldest review date.
    """
    try:
        # Get place details, specifically reviews
        place_details = gmaps.place(
            place_id=place_id,
            fields=['review'],
            language='en'
        )
        
        reviews = place_details.get('result', {}).get('reviews', [])
        if not reviews:
            return None

        # Find the oldest review by sorting
        oldest_review = min(reviews, key=lambda r: r.get('time', float('inf')))
        
        # Convert timestamp to ISO 8601 date string
        if 'time' in oldest_review:
            return datetime.fromtimestamp(oldest_review['time']).strftime('%Y-%m-%d')
            
    except Exception as e:
        print(f"Could not fetch details for {place_id}: {e}")
    
    return None

def update_founded_dates():
    """
    Updates places in Supabase with an estimated founded date from the oldest review.
    """
    # Fetch places that don't have a founded_date yet
    response = supabase.table('places').select('id, google_place_id').is_('founded_date', 'null').execute()
    
    if not response.data:
        print("No places found that need a founded date update.")
        return

    places_to_update = response.data
    print(f"Found {len(places_to_update)} places to update with a founded date.")

    for place in places_to_update:
        print(f"Processing place ID: {place['google_place_id']}")
        oldest_date = get_oldest_review_date(place['google_place_id'])
        
        if oldest_date:
            try:
                # Update the record in Supabase
                supabase.table('places').update({'founded_date': oldest_date}).eq('id', place['id']).execute()
                print(f"  -> Updated founded date to {oldest_date}")
            except Exception as e:
                print(f"  -> Failed to update founded date: {e}")
        else:
            print("  -> No reviews found, cannot determine founded date.")
            
        time.sleep(1.5) # To avoid hitting API rate limits

if __name__ == "__main__":
    update_founded_dates()
