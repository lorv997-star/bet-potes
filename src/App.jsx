import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://vmvruczvqzclpcyniciz.supabase.co",
  "sb_publishable_9fXF-b9ovbcRGZqY53IH1w_I-Mz14fv"
);

export default function App() {
  const [username, setUsername] = useState("");
  const [bets, setBets] = useState([]);
  const [newBet, setNewBet] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (username) {
      loadBets();
    }
  }, [username]);

  async function loadBets() {
    setLoading(true);
    const { data, error } = await supabase.from("bets").select("*");

    if (error) {
      console.log("LOAD ERROR:", error);
    } else {
      setBets(data || []);
    }

    setLoading(false);
  }

  async function createBet() {
    if (!newBet) return;

    const { error } = await supabase
      .from("bets")
      .insert({ title: newBet });

    if (error) {
      console.log("INSERT ERROR:", error);
    }

    setNewBet("");
    loadBets();
  }

  if (!username) {
    return (
      <div style={{ padding: 50 }}>
        <h1>🎲 Bet entre potes</h1>
        <input
          placeholder="Ton pseudo"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: 50 }}>
      <h1>Bienvenue {username}</h1>

      <input
        placeholder="Nouveau pari"
        value={newBet}
        onChange={(e) => setNewBet(e.target.value)}
      />
      <button onClick={createBet}>Créer pari</button>

      <h2>Paris :</h2>

      {loading && <div>Chargement...</div>}

      {bets.map((b) => (
        <div key={b.id}>{b.title}</div>
      ))}
    </div>
  );
}