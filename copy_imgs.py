import shutil, os

SRC_ARTIFACTS = "/Users/johanafragosoblendl/.verdent/artifacts/buckets/e39d61ca-ef46-462e-9448-f0581383c6e5/images"
DST = "/Users/johanafragosoblendl/.verdent/verdent-projects/Mochi/public"

shutil.copy(f"{SRC_ARTIFACTS}/1774555790064_0bfd5dcb.png", f"{DST}/bg_garden.png")
shutil.copy(f"{SRC_ARTIFACTS}/1774555831793_c2691a6c.png", f"{DST}/bg_indoor.png")
print("Images copied!")
