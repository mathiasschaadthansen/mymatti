from PIL import Image
import os

# Vi definerer de navne, filen typisk kan have
potential_names = ["icon.png", "Icon.png", "icon.png.jpg", "Icon.png.jpg"]
input_file = None

# Vi leder efter filen i mappen
for name in potential_names:
    if os.path.exists(name):
        input_file = name
        break

if input_file:
    print(f"🔍 Fandt filen: {input_file}. Går i gang med at lave ikoner...")
    img = Image.open(input_file)
    
    # Gør billedet kvadratisk (beskær fra midten)
    width, height = img.size
    min_dim = min(width, height)
    left = (width - min_dim) / 2
    top = (height - min_dim) / 2
    right = (width + min_dim) / 2
    bottom = (height + min_dim) / 2
    img_square = img.crop((left, top, right, bottom))
    
    # Gem PWA størrelserne
    img_square.resize((192, 192)).save("icon-192.png")
    img_square.resize((512, 512)).save("icon-512.png")
    img_square.resize((32, 32)).save("favicon.png")
    
    print("✅ Succes! icon-192.png, icon-512.png og favicon.png er oprettet.")
else:
    print("❌ Fejl: Kunne ikke finde dit ikon-billede.")
    print(f"Tjek at filen ligger i mappen: {os.getcwd()}")
    print("Filen skal hedde præcis 'icon.png' (små bogstaver).")