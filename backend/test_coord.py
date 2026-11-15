from pyproj import CRS, Transformer

proj_wkt = """PROJCS["Moon_2000_South_Pole_Stereographic",
    GEOGCS["GCS_Moon_2000",
        DATUM["D_Moon_2000",
            SPHEROID["Moon_2000_IAU_IAG",1737400,0]],
        PRIMEM["Reference_Meridian",0],
        UNIT["Degree",0.0174532925199433]],
    PROJECTION["Stereographic"],
    PARAMETER["false_easting",0],
    PARAMETER["false_northing",0],
    PARAMETER["central_meridian",0],
    PARAMETER["scale_factor",1],
    PARAMETER["latitude_of_origin",-90],
    UNIT["Meter",1]]"""

proj_crs = CRS.from_wkt(proj_wkt)
geo_crs = proj_crs.geodetic_crs

print("Proj CRS name:", proj_crs.name)
print("Geo CRS name:", geo_crs.name)

t = Transformer.from_crs(geo_crs, proj_crs, always_xy=True)
x, y = t.transform(-5.0, -87.45)
print(f"Haworth Rim (-87.45, -5.0) -> X: {x:.2f} m, Y: {y:.2f} m")

t_inv = Transformer.from_crs(proj_crs, geo_crs, always_xy=True)
lon, lat = t_inv.transform(x, y)
print(f"Inverse -> Lon: {lon:.6f}, Lat: {lat:.6f}")
