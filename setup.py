import shutil, os

SRC = "/Users/johanafragosoblendl/Downloads/MOCHI BACKUP"
DST = "/Users/johanafragosoblendl/.verdent/verdent-projects/Mochi"

os.makedirs(f"{DST}/src", exist_ok=True)
os.makedirs(f"{DST}/public", exist_ok=True)

shutil.copy(f"{SRC}/bkpackage.json", f"{DST}/package.json")
shutil.copy(f"{SRC}/vite.config.js", f"{DST}/vite.config.js")
shutil.copy(f"{SRC}/bkindex.html", f"{DST}/index.html")
shutil.copy(f"{SRC}/firebase.json", f"{DST}/firebase.json")
shutil.copy(f"{SRC}/firestore.rules", f"{DST}/firestore.rules")

shutil.copy(f"{SRC}/src/bkApp.jsx", f"{DST}/src/App.jsx")
shutil.copy(f"{SRC}/src/firebase.js", f"{DST}/src/firebase.js")
shutil.copy(f"{SRC}/src/Cuestionarios.jsx", f"{DST}/src/Cuestionarios.jsx")

for f in ["_redirects", "apple-touch-icon.png", "bksw.js", "icon-192.png", "icon-512.png", "icon.svg", "manifest.json"]:
    shutil.copy(f"{SRC}/public/{f}", f"{DST}/public/{f}")

shutil.copy(f"{SRC}/public/bksw.js", f"{DST}/public/sw.js")

main_content = open(f"{SRC}/src/bkmain.jsx").read().replace("from './App.jsx'", "from './App.jsx'")
with open(f"{DST}/src/main.jsx", "w") as out:
    out.write(main_content)

print("Done!")
