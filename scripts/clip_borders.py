import json
from shapely.geometry import shape, mapping

def main():
    # Load India boundary
    with open('public/India_Official_Boundary.geojson', 'r', encoding='utf-8') as f:
        india_geojson = json.load(f)
    
    india_feature = india_geojson['features'][0]
    india_shape = shape(india_feature['geometry'])
    
    # Check if shape is valid
    if not india_shape.is_valid:
        print("India shape is not valid. Buffering to fix...")
        india_shape = india_shape.buffer(0)
        
    # Load world.json
    with open('public/world.json', 'r', encoding='utf-8') as f:
        world_geojson = json.load(f)
        
    modified_features = []
    
    for feature in world_geojson['features']:
        props = feature.get('properties', {})
        name = props.get('name', '')
        
        # We don't need to clip India itself because it is hidden in MapView
        if name.lower() == 'india':
            modified_features.append(feature)
            continue
            
        geom = feature.get('geometry')
        if not geom:
            modified_features.append(feature)
            continue
            
        feature_shape = shape(geom)
        if not feature_shape.is_valid:
            print(f"Feature shape for {name} is not valid. Buffering...")
            feature_shape = feature_shape.buffer(0)
            
        if feature_shape.intersects(india_shape):
            print(f"Intersection found for {name}. Clipping...")
            try:
                # Subtract India from the country's shape
                clipped_shape = feature_shape.difference(india_shape)
                
                # Check if resulting geometry is empty
                if clipped_shape.is_empty:
                    print(f"Warning: {name} became empty after clipping!")
                else:
                    feature['geometry'] = mapping(clipped_shape)
            except Exception as e:
                print(f"Error clipping {name}: {e}")
                
        modified_features.append(feature)
        
    world_geojson['features'] = modified_features
    
    with open('public/world.json', 'w', encoding='utf-8') as f:
        json.dump(world_geojson, f, ensure_ascii=False, indent=2)
    print("Borders clipped and public/world.json updated successfully.")

if __name__ == '__main__':
    main()
