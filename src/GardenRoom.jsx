import React, { useState, useEffect } from "react";

// Ejemplo de ítems de la tienda
const SHOP_ITEMS = [
  { id: 1, name: "Maceta kawaii", price: 10, emoji: "🪴" },
  { id: 2, name: "Lámpara panda", price: 15, emoji: "🐼" },
  { id: 3, name: "Cuadro amoroso", price: 8, emoji: "🖼️" },
  { id: 4, name: "Alfombra arcoíris", price: 12, emoji: "🌈" },
];

const getInventory = () => {
  try {
    return JSON.parse(localStorage.getItem("mochi_inventory")) || [];
  } catch {
    return [];
  }
};
const setInventory = (inv) => {
  localStorage.setItem("mochi_inventory", JSON.stringify(inv));
};

const getRoomItems = () => {
  try {
    return JSON.parse(localStorage.getItem("mochi_room_items")) || [];
  } catch {
    return [];
  }
};
const setRoomItems = (items) => {
  localStorage.setItem("mochi_room_items", JSON.stringify(items));
};

export default function GardenRoom() {
  const [coins, setCoins] = useState(30);
  const [inventory, setInventoryState] = useState(getInventory());
  const [roomItems, setRoomItemsState] = useState(getRoomItems());

  useEffect(() => {
    setInventory(inventory);
  }, [inventory]);
  useEffect(() => {
    setRoomItems(roomItems);
  }, [roomItems]);

  const buyItem = (item) => {
    if (coins >= item.price) {
      setCoins(coins - item.price);
      setInventoryState([...inventory, item]);
    }
  };

  const placeItem = (item) => {
    setRoomItemsState([...roomItems, { ...item, x: 50 + Math.random() * 300, y: 80 + Math.random() * 200 }]);
    setInventoryState(inventory.filter((i) => i.id !== item.id));
  };

  return (
    <div style={{ minHeight: "100vh", background: "#e6d6f7", padding: 40 }}>
      <h2>Mi Jardín / Cuarto</h2>
      <div style={{ marginBottom: 16 }}>Monedas: <b>{coins}</b></div>
      <div style={{ display: "flex", gap: 32 }}>
        {/* Tienda */}
        <div style={{ flex: 1, background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 2px 8px #0001" }}>
          <h3>Tienda</h3>
          {SHOP_ITEMS.map((item) => (
            <div key={item.id} style={{ margin: "8px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 24 }}>{item.emoji}</span>
              <span>{item.name}</span>
              <span>{item.price} 🪙</span>
              <button onClick={() => buyItem(item)} disabled={coins < item.price}>Comprar</button>
            </div>
          ))}
        </div>
        {/* Inventario */}
        <div style={{ flex: 1, background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 2px 8px #0001" }}>
          <h3>Inventario</h3>
          {inventory.length === 0 && <div>Sin ítems</div>}
          {inventory.map((item) => (
            <div key={item.id} style={{ margin: "8px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 24 }}>{item.emoji}</span>
              <span>{item.name}</span>
              <button onClick={() => placeItem(item)}>Colocar en cuarto</button>
            </div>
          ))}
        </div>
        {/* Jardín/Cuarto */}
        <div style={{ flex: 2, background: "#f5f0ff", borderRadius: 16, padding: 16, minHeight: 480, position: "relative", boxShadow: "0 2px 8px #0001" }}>
          <h3>Mi espacio</h3>
          <div style={{ position: "relative", width: 400, height: 440, background: "#e3d8f8", borderRadius: 12, margin: "0 auto" }}>
            {roomItems.map((item, idx) => (
              <span key={idx} style={{ position: "absolute", left: item.x, top: item.y, fontSize: 32 }}>{item.emoji}</span>
            ))}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 32, background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 2px 8px #0001" }}>
        <b>Acuerdo de pareja:</b> Recuerda que este espacio es para compartir y cuidar juntos. ¡Hablen y decidan cómo decorarlo!
      </div>
    </div>
  );
}
