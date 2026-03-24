import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://YOUR_PROJECT.supabase.co";
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || "YOUR_PUBLISHABLE_KEY";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const STARTING_MONEY = 1000;
const ADMIN_USERNAMES = ["Tim", "tim", "lory997-star"];
const ADMIN_CODE = "betboss";

const initialBetForm = {
  title: "",
  category: "Fun",
  closes_at: "",
  options: [
    { name: "Oui", odds: 1.8 },
    { name: "Non", odds: 2.1 },
  ],
};

export default function App() {
  const [username, setUsername] = useState(
    localStorage.getItem("bet-potes-user") || ""
  );
  const [pseudoDraft, setPseudoDraft] = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(false);

  const [bets, setBets] = useState([]);
  const [options, setOptions] = useState([]);
  const [wagers, setWagers] = useState([]);
  const [scores, setScores] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [comments, setComments] = useState([]);

  const [betForm, setBetForm] = useState(initialBetForm);
  const [proposalDraft, setProposalDraft] = useState("");
  const [commentDrafts, setCommentDrafts] = useState({});
  const [amountDrafts, setAmountDrafts] = useState({});

  const [activeTab, setActiveTab] = useState("open");
  const [categoryFilter, setCategoryFilter] = useState("Toutes");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState("newest");

  const [isSubmittingBet, setIsSubmittingBet] = useState(false);
  const [isSubmittingProposal, setIsSubmittingProposal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isConfigured =
    !SUPABASE_URL.includes("YOUR_PROJECT") &&
    !SUPABASE_KEY.includes("YOUR_PUBLISHABLE_KEY");
  const isAdmin = adminUnlocked || ADMIN_USERNAMES.includes(username);

  useEffect(() => {
    if (username) {
      localStorage.setItem("bet-potes-user", username);
    }
  }, [username]);

  useEffect(() => {
    if (!isConfigured) return;

    loadAll();

    const channel = supabase
      .channel("bet-potes-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bets" },
        () => loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "options" },
        () => loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wagers" },
        () => loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scores" },
        () => loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "proposals" },
        () => loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments" },
        () => loadAll()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isConfigured]);

  async function ensureProfile(name) {
    if (!name) return;
    const existing = scores.find((entry) => entry.username === name);
    if (!existing) {
      await supabase.from("scores").upsert({
        username: name,
        score: 0,
        money: STARTING_MONEY,
      });
    }
  }

  async function loadAll() {
    setLoading(true);
    setErrorMessage("");

    const [
      betsRes,
      optionsRes,
      wagersRes,
      scoresRes,
      proposalsRes,
      commentsRes,
    ] = await Promise.all([
      supabase.from("bets").select("*").order("id", { ascending: false }),
      supabase.from("options").select("*").order("id", { ascending: true }),
      supabase.from("wagers").select("*").order("id", { ascending: false }),
      supabase.from("scores").select("*").order("money", { ascending: false }),
      supabase.from("proposals").select("*").order("id", { ascending: false }),
      supabase.from("comments").select("*").order("id", { ascending: false }),
    ]);

    const firstError =
      betsRes.error ||
      optionsRes.error ||
      wagersRes.error ||
      scoresRes.error ||
      proposalsRes.error ||
      commentsRes.error;

    if (firstError) {
      setErrorMessage(firstError.message);
    }

    setBets(betsRes.data || []);
    setOptions(optionsRes.data || []);
    setWagers(wagersRes.data || []);
    setScores(scoresRes.data || []);
    setProposals(proposalsRes.data || []);
    setComments(commentsRes.data || []);
    setLoading(false);
  }

  const optionsByBet = useMemo(() => {
    const map = {};
    options.forEach((option) => {
      if (!map[option.bet_id]) map[option.bet_id] = [];
      map[option.bet_id].push(option);
    });
    return map;
  }, [options]);

  const wagersByOption = useMemo(() => {
    const map = {};
    wagers.forEach((wager) => {
      if (!map[wager.option_id]) map[wager.option_id] = [];
      map[wager.option_id].push(wager);
    });
    return map;
  }, [wagers]);

  const commentsByBet = useMemo(() => {
    const map = {};
    comments.forEach((comment) => {
      if (!map[comment.bet_id]) map[comment.bet_id] = [];
      map[comment.bet_id].push(comment);
    });
    return map;
  }, [comments]);

  const scoreMap = useMemo(() => {
    const map = new Map();
    scores.forEach((entry) => map.set(entry.username, entry));
    return map;
  }, [scores]);

  const userProfile =
    scoreMap.get(username) || { username, score: 0, money: STARTING_MONEY };

  const leaderboard = useMemo(() => {
    const names = new Set(scores.map((s) => s.username));
    wagers.forEach((w) => names.add(w.username));
    if (username) names.add(username);

    return [...names]
      .map((name) => {
        const profile =
          scoreMap.get(name) || {
            username: name,
            score: 0,
            money: STARTING_MONEY,
          };
        const played = wagers.filter((w) => w.username === name).length;
        return {
          name,
          score: Number(profile.score || 0),
          money: Number(profile.money ?? STARTING_MONEY),
          played,
        };
      })
      .sort(
        (a, b) =>
          b.money - a.money ||
          b.score - a.score ||
          b.played - a.played ||
          a.name.localeCompare(b.name)
      );
  }, [scores, wagers, username, scoreMap]);

  const myHistory = useMemo(() => {
    const optionMap = new Map(options.map((o) => [o.id, o]));
    const betMap = new Map(bets.map((b) => [b.id, b]));

    return wagers
      .filter((w) => w.username === username)
      .map((wager) => {
        const option = optionMap.get(wager.option_id);
        const bet = option ? betMap.get(option.bet_id) : null;
        const won = bet?.winning_option_id === option?.id;
        const amount = Number(wager.amount || 0);
        const odds = Number(option?.odds || 1);
        const profit = bet?.resolved
          ? won
            ? Math.round(amount * odds - amount)
            : -amount
          : 0;

        return { wager, option, bet, won, amount, odds, profit };
      })
      .filter((item) => item.bet && item.option)
      .sort((a, b) => b.wager.id - a.wager.id);
  }, [wagers, options, bets, username]);

  const userStats = useMemo(() => {
    const resolved = myHistory.filter((item) => item.bet?.resolved);
    const wins = resolved.filter((item) => item.won).length;
    const losses = resolved.length - wins;
    const totalStaked = myHistory.reduce((sum, item) => sum + item.amount, 0);
    const totalProfit = resolved.reduce((sum, item) => sum + item.profit, 0);
    const roi = totalStaked > 0 ? Math.round((totalProfit / totalStaked) * 100) : 0;
    return { wins, losses, totalStaked, totalProfit, roi };
  }, [myHistory]);

  const badges = useMemo(() => {
    const items = [];
    if (userStats.wins >= 5) items.push("🧠 Pro bettor");
    if (leaderboard[0]?.name === username) items.push("🐐 Goat");
    if (userStats.roi >= 50 && userStats.totalStaked >= 100)
      items.push("📈 ROI monster");
    if (
      myHistory.some(
        (item) => item.bet?.resolved && item.won && Number(item.odds) >= 3
      )
    ) {
      items.push("🎯 Sniper grosse cote");
    }
    if (
      myHistory.some(
        (item) => item.bet?.resolved && !item.won && item.amount >= 500
      )
    ) {
      items.push("💀 All-in raté");
    }
    if (myHistory.length >= 10) items.push("🔥 Volume trader");
    return items;
  }, [userStats, leaderboard, username, myHistory]);

  const categories = useMemo(() => {
    const set = new Set(["Toutes"]);
    bets.forEach((bet) => set.add(bet.category || "Fun"));
    return [...set];
  }, [bets]);

  const marketStats = useMemo(() => {
    const openCount = bets.filter((bet) => !bet.resolved).length;
    const resolvedCount = bets.filter((bet) => bet.resolved).length;
    const players = new Set(wagers.map((w) => w.username));
    if (username) players.add(username);
    const totalVolume = wagers.reduce(
      (sum, wager) => sum + Number(wager.amount || 0),
      0
    );
    return { openCount, resolvedCount, players: players.size, totalVolume };
  }, [bets, wagers, username]);

  const visibleBets = useMemo(() => {
    let data = bets.filter((bet) => {
      const matchesTab =
        activeTab === "all"
          ? true
          : activeTab === "open"
          ? !bet.resolved
          : bet.resolved;
      const matchesCategory =
        categoryFilter === "Toutes"
          ? true
          : (bet.category || "Fun") === categoryFilter;
      const matchesSearch = bet.title
        .toLowerCase()
        .includes(search.toLowerCase());

      return matchesTab && matchesCategory && matchesSearch;
    });

    if (sortMode === "newest") {
      data.sort((a, b) => (b.id || 0) - (a.id || 0));
    } else if (sortMode === "oldest") {
      data.sort((a, b) => (a.id || 0) - (b.id || 0));
    } else if (sortMode === "volume") {
      data.sort((a, b) => {
        const volA = (optionsByBet[a.id] || []).reduce(
          (sum, option) =>
            sum +
            (wagersByOption[option.id] || []).reduce(
              (acc, w) => acc + Number(w.amount || 0),
              0
            ),
          0
        );
        const volB = (optionsByBet[b.id] || []).reduce(
          (sum, option) =>
            sum +
            (wagersByOption[option.id] || []).reduce(
              (acc, w) => acc + Number(w.amount || 0),
              0
            ),
          0
        );
        return volB - volA;
      });
    }

    return data;
  }, [
    bets,
    activeTab,
    categoryFilter,
    search,
    sortMode,
    optionsByBet,
    wagersByOption,
  ]);

  async function handleLogin(e) {
    e.preventDefault();
    const clean = pseudoDraft.trim();
    if (!clean) return;
    setUsername(clean);
    await ensureProfile(clean);
    setPseudoDraft("");
  }

  function logout() {
    localStorage.removeItem("bet-potes-user");
    setUsername("");
    setPseudoDraft("");
    setAdminUnlocked(false);
  }

  function unlockAdmin() {
    const code = window.prompt("Code admin ?");
    if (code === ADMIN_CODE) {
      setAdminUnlocked(true);
    } else if (code) {
      setErrorMessage("Code admin incorrect.");
    }
  }

  function updateBetOption(index, field, value) {
    setBetForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, [field]: value } : option
      ),
    }));
  }

  function addOptionField() {
    setBetForm((current) => ({
      ...current,
      options: [...current.options, { name: "", odds: 2 }],
    }));
  }

  function removeOptionField(index) {
    setBetForm((current) => ({
      ...current,
      options: current.options.filter((_, i) => i !== index),
    }));
  }

  async function createBet(e) {
    e.preventDefault();
    if (!isAdmin) return;

    const title = betForm.title.trim();
    const category = (betForm.category || "Fun").trim() || "Fun";
    const cleanedOptions = betForm.options
      .map((option) => ({
        name: option.name.trim(),
        odds: Number(option.odds) || 1,
      }))
      .filter((option) => option.name);

    if (!title || cleanedOptions.length < 2) {
      setErrorMessage("Ajoute un titre et au moins 2 options.");
      return;
    }

    setIsSubmittingBet(true);
    setErrorMessage("");

    const { data: insertedBet, error: betError } = await supabase
      .from("bets")
      .insert({
        title,
        category,
        resolved: false,
        closes_at: betForm.closes_at
          ? new Date(betForm.closes_at).toISOString()
          : null,
      })
      .select()
      .single();

    if (betError) {
      setErrorMessage(betError.message);
      setIsSubmittingBet(false);
      return;
    }

    const { error: optionError } = await supabase.from("options").insert(
      cleanedOptions.map((option) => ({
        bet_id: insertedBet.id,
        name: option.name,
        odds: option.odds,
      }))
    );

    if (optionError) {
      setErrorMessage(optionError.message);
    } else {
      setBetForm(initialBetForm);
    }

    setIsSubmittingBet(false);
    await loadAll();
  }

  async function placeBet(bet, option) {
    if (!username || bet.resolved) return;

    await ensureProfile(username);

    const amount = Number(amountDrafts[bet.id] || 0);
    if (!amount || amount <= 0) {
      setErrorMessage("Entre un montant valide.");
      return;
    }

    const profile =
      scoreMap.get(username) || { score: 0, money: STARTING_MONEY };

    if (amount > Number(profile.money || 0)) {
      setErrorMessage("Tu n'as pas assez d'argent fictif.");
      return;
    }

    const marketOptionIds = (optionsByBet[bet.id] || []).map((o) => o.id);
    const existing = wagers.find(
      (w) => w.username === username && marketOptionIds.includes(w.option_id)
    );

    if (existing) {
      setErrorMessage("Une seule position par marché.");
      return;
    }

    const { error: wagerError } = await supabase.from("wagers").insert({
      username,
      option_id: option.id,
      amount,
    });

    if (wagerError) {
      setErrorMessage(wagerError.message);
      return;
    }

    await supabase.from("scores").upsert({
      username,
      score: Number(profile.score || 0),
      money: Number(profile.money || 0) - amount,
    });

    setAmountDrafts((current) => ({ ...current, [bet.id]: "" }));
    await loadAll();
  }

  async function resolveBet(bet, winningOption) {
    if (!isAdmin || bet.resolved) return;

    const marketOptions = optionsByBet[bet.id] || [];
    const optionIds = marketOptions.map((option) => option.id);
    const marketWagers = wagers.filter((w) => optionIds.includes(w.option_id));

    const profileMap = new Map(
      scores.map((profile) => [profile.username, { ...profile }])
    );

    marketWagers.forEach((wager) => {
      const profile =
        profileMap.get(wager.username) || {
          username: wager.username,
          score: 0,
          money: STARTING_MONEY,
        };

      if (wager.option_id === winningOption.id) {
        const odds = Number(winningOption.odds || 1);
        profile.money =
          Number(profile.money || 0) +
          Math.round(Number(wager.amount || 0) * odds);
        profile.score = Number(profile.score || 0) + Math.max(10, Math.round(10 * odds));
      }

      profileMap.set(wager.username, profile);
    });

    const { error: betError } = await supabase
      .from("bets")
      .update({ resolved: true, winning_option_id: winningOption.id })
      .eq("id", bet.id);

    if (betError) {
      setErrorMessage(
        "Ajoute la colonne winning_option_id dans la table bets."
      );
      return;
    }

    await supabase.from("scores").upsert(
      [...profileMap.values()].map((profile) => ({
        username: profile.username,
        score: Number(profile.score || 0),
        money: Number(profile.money ?? STARTING_MONEY),
      }))
    );

    await loadAll();
  }

  async function resetSeason() {
    if (!isAdmin) return;
    const ok = window.confirm(
      "Reset complet de la saison ? Les scores reviennent à 0, l'argent à 1000, les wagers et commentaires sont vidés."
    );
    if (!ok) return;

    const usernames = new Set([
      ...scores.map((s) => s.username),
      ...wagers.map((w) => w.username),
    ]);

    const resetRows = [...usernames].map((name) => ({
      username: name,
      score: 0,
      money: STARTING_MONEY,
    }));

    if (resetRows.length > 0) {
      await supabase.from("scores").upsert(resetRows);
    }

    await supabase.from("wagers").delete().neq("id", -1);
    await supabase.from("comments").delete().neq("id", -1);
    await loadAll();
  }

  async function submitProposal(e) {
    e.preventDefault();
    if (!proposalDraft.trim() || !username) return;

    setIsSubmittingProposal(true);

    const { error } = await supabase.from("proposals").insert({
      text: proposalDraft.trim(),
      username,
    });

    if (error) {
      setErrorMessage(error.message);
    } else {
      setProposalDraft("");
    }

    setIsSubmittingProposal(false);
    await loadAll();
  }

  function convertProposalToBet(proposal) {
    if (!isAdmin) return;
    setBetForm({
      title: proposal.text,
      category: "Fun",
      closes_at: "",
      options: [
        { name: "Oui", odds: 1.8 },
        { name: "Non", odds: 2.1 },
      ],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteProposal(id) {
    if (!isAdmin) return;
    await supabase.from("proposals").delete().eq("id", id);
    await loadAll();
  }

  async function addComment(betId) {
    const text = (commentDrafts[betId] || "").trim();
    if (!text || !username) return;

    await supabase.from("comments").insert({
      bet_id: betId,
      username,
      text,
    });

    setCommentDrafts((current) => ({ ...current, [betId]: "" }));
    await loadAll();
  }

  const topPlayer = leaderboard[0];

  if (!isConfigured) {
    return (
      <div style={styles.page}>
        <style>{globalStyles}</style>
        <div style={styles.centerCard}>
          <h1 style={styles.heroTitle}>⚙️ Configure Supabase</h1>
          <p style={styles.muted}>
            Ajoute <strong>VITE_SUPABASE_URL</strong> et{" "}
            <strong>VITE_SUPABASE_ANON_KEY</strong> dans Vercel.
          </p>
        </div>
      </div>
    );
  }

  if (!username) {
    return (
      <div style={styles.page}>
        <style>{globalStyles}</style>
        <div style={styles.loginWrap}>
          <div style={styles.glowOrbA} />
          <div style={styles.glowOrbB} />
          <div style={styles.loginCard}>
            <div style={styles.heroBadge}>Version finale</div>
            <h1 style={styles.heroTitle}>🎲 Bet entre potes</h1>
            <p style={styles.heroText}>
              Marchés privés entre potes, bankroll fictive, commentaires,
              badges, historique, leaderboard et admin.
            </p>
            <form onSubmit={handleLogin} style={styles.loginForm}>
              <input
                style={styles.input}
                placeholder="Ton pseudo complet"
                value={pseudoDraft}
                onChange={(e) => setPseudoDraft(e.target.value)}
              />
              <button type="submit" style={styles.primaryButton}>
                Entrer dans le marché
              </button>
            </form>
            <div style={styles.loginFeatures}>
              <span style={styles.chip}>1000$ de départ</span>
              <span style={styles.chip}>Commentaires</span>
              <span style={styles.chip}>Historique</span>
              <span style={styles.chip}>Badges</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <style>{globalStyles}</style>

      <div style={styles.topbar}>
        <div style={styles.logoRow}>
          <div style={styles.logo}>◆</div>
          <div>
            <div style={styles.brand}>Bet entre potes</div>
            <div style={styles.brandSub}>final edition • private market</div>
          </div>
        </div>

        <div style={styles.topbarRight}>
          <div style={styles.userPill}>👤 {username}</div>
          <div style={styles.userPill}>
            💸 {Number(userProfile.money || STARTING_MONEY)}$
          </div>
          <div style={styles.userPill}>🏆 {Number(userProfile.score || 0)} pts</div>
          {!isAdmin && (
            <button style={styles.ghostButton} onClick={unlockAdmin}>
              Débloquer admin
            </button>
          )}
          <button style={styles.ghostButton} onClick={logout}>
            Changer de pseudo
          </button>
        </div>
      </div>

      <div style={styles.heroGrid}>
        <div style={styles.heroCardLarge}>
          <div style={styles.heroSmall}>Marché principal</div>
          <h2 style={styles.heroBigTitle}>
            Parie comme un trader. Brag comme un champion.
          </h2>
          <p style={styles.muted}>
            Style inspiré Polymarket, mais pensé pour le fun entre potes :
            bankroll fictive, ROI, historique, commentaires et catégories.
          </p>

          <div style={styles.statRow}>
            <div style={styles.statBox}>
              <strong>{marketStats.openCount}</strong>
              <span>Marchés ouverts</span>
            </div>
            <div style={styles.statBox}>
              <strong>{marketStats.players}</strong>
              <span>Joueurs actifs</span>
            </div>
            <div style={styles.statBox}>
              <strong>{marketStats.totalVolume}$</strong>
              <span>Volume total</span>
            </div>
          </div>
        </div>

        <div style={styles.heroCardSide}>
          <div style={styles.heroSmall}>Top trader</div>
          <div style={styles.topPlayerName}>
            {topPlayer ? topPlayer.name : "Personne"}
          </div>
          <div style={styles.topPlayerScore}>
            {topPlayer ? `${topPlayer.money}$` : "1000$"}
          </div>
          <div style={styles.muted}>
            Le leaderboard principal se base sur l’argent fictif.
          </div>
        </div>
      </div>

      {errorMessage ? <div style={styles.errorBanner}>{errorMessage}</div> : null}

      <div style={styles.contentGrid}>
        <div style={styles.mainColumn}>
          {isAdmin && (
            <div style={styles.panelCard}>
              <div style={styles.panelHeader}>
                <div>
                  <h3 style={styles.panelTitle}>Panel admin final</h3>
                  <p style={styles.muted}>
                    Crée, catégorise, résous et reset la saison.
                  </p>
                </div>
                <div style={styles.proposalActions}>
                  <span style={styles.adminBadge}>ADMIN</span>
                  <button style={styles.smallDangerButton} onClick={resetSeason}>
                    Reset saison
                  </button>
                </div>
              </div>

              <form onSubmit={createBet} style={styles.formGrid}>
                <input
                  style={{ ...styles.input, gridColumn: "1 / -1" }}
                  placeholder="Titre du pari"
                  value={betForm.title}
                  onChange={(e) =>
                    setBetForm((current) => ({
                      ...current,
                      title: e.target.value,
                    }))
                  }
                />

                <input
                  style={styles.input}
                  placeholder="Catégorie"
                  value={betForm.category}
                  onChange={(e) =>
                    setBetForm((current) => ({
                      ...current,
                      category: e.target.value,
                    }))
                  }
                />

                <input
                  style={styles.input}
                  type="datetime-local"
                  value={betForm.closes_at}
                  onChange={(e) =>
                    setBetForm((current) => ({
                      ...current,
                      closes_at: e.target.value,
                    }))
                  }
                />

                {betForm.options.map((option, index) => (
                  <div key={index} style={styles.optionRow}>
                    <input
                      style={{ ...styles.input, flex: 1 }}
                      placeholder={`Option ${index + 1}`}
                      value={option.name}
                      onChange={(e) =>
                        updateBetOption(index, "name", e.target.value)
                      }
                    />
                    <input
                      style={{ ...styles.input, width: 90 }}
                      type="number"
                      step="0.1"
                      min="1"
                      value={option.odds}
                      onChange={(e) =>
                        updateBetOption(index, "odds", e.target.value)
                      }
                    />
                    {betForm.options.length > 2 && (
                      <button
                        type="button"
                        style={styles.smallDangerButton}
                        onClick={() => removeOptionField(index)}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}

                <div style={styles.formActions}>
                  <button
                    type="button"
                    style={styles.ghostButton}
                    onClick={addOptionField}
                  >
                    + Ajouter une option
                  </button>
                  <button
                    type="submit"
                    style={styles.primaryButton}
                    disabled={isSubmittingBet}
                  >
                    {isSubmittingBet ? "Création..." : "Publier"}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div style={styles.panelCard}>
            <div style={styles.panelHeader}>
              <div>
                <h3 style={styles.panelTitle}>Marchés</h3>
                <p style={styles.muted}>
                  Choisis une position, mise un montant, et fais grossir ta
                  bankroll.
                </p>
              </div>
            </div>

            <div style={styles.filtersRow}>
              <div style={styles.tabRow}>
                {[
                  ["open", "Ouverts"],
                  ["resolved", "Résolus"],
                  ["all", "Tous"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    style={activeTab === value ? styles.activeTab : styles.tab}
                    onClick={() => setActiveTab(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div style={styles.tabRow}>
                <select
                  style={styles.select}
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  {categories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>

                <select
                  style={styles.select}
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value)}
                >
                  <option value="newest">Plus récents</option>
                  <option value="oldest">Plus anciens</option>
                  <option value="volume">Plus de volume</option>
                </select>

                <input
                  style={styles.searchInput}
                  placeholder="Rechercher un marché"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {loading ? <div style={styles.loadingBox}>Chargement...</div> : null}

            <div style={styles.marketList}>
              {visibleBets.map((bet) => {
                const marketOptions = optionsByBet[bet.id] || [];
                const totalVolume = marketOptions.reduce(
                  (sum, option) =>
                    sum +
                    (wagersByOption[option.id] || []).reduce(
                      (acc, wager) => acc + Number(wager.amount || 0),
                      0
                    ),
                  0
                );

                return (
                  <div key={bet.id} style={styles.marketCard}>
                    <div style={styles.marketHeader}>
                      <div>
                        <div style={styles.marketMeta}>
                          <span
                            style={bet.resolved ? styles.resolvedPill : styles.openPill}
                          >
                            {bet.resolved ? "Résolu" : "Ouvert"}
                          </span>
                          <span style={styles.marketCount}>
                            {(bet.category || "Fun").toUpperCase()}
                          </span>
                          <span style={styles.marketCount}>
                            Volume {totalVolume}$
                          </span>
                        </div>
                        <h4 style={styles.marketTitle}>{bet.title}</h4>
                      </div>
                    </div>

                    {!bet.resolved && (
                      <div style={styles.betAmountRow}>
                        <input
                          style={styles.input}
                          type="number"
                          min="1"
                          placeholder="Montant à miser"
                          value={amountDrafts[bet.id] || ""}
                          onChange={(e) =>
                            setAmountDrafts((current) => ({
                              ...current,
                              [bet.id]: e.target.value,
                            }))
                          }
                        />
                      </div>
                    )}

                    <div style={styles.optionsGrid}>
                      {marketOptions.map((option) => {
                        const optionWagers = wagersByOption[option.id] || [];
                        const optionVolume = optionWagers.reduce(
                          (sum, wager) => sum + Number(wager.amount || 0),
                          0
                        );
                        const share =
                          totalVolume > 0
                            ? Math.round((optionVolume / totalVolume) * 100)
                            : 0;

                        const pickedByUser = optionWagers.some(
                          (w) => w.username === username
                        );
                        const isWinner = bet.winning_option_id === option.id;

                        return (
                          <button
                            key={option.id}
                            style={{
                              ...styles.optionCard,
                              ...(pickedByUser ? styles.optionCardPicked : {}),
                              ...(isWinner ? styles.optionCardWinner : {}),
                            }}
                            onClick={() => !bet.resolved && placeBet(bet, option)}
                            disabled={bet.resolved}
                          >
                            <div style={styles.optionTop}>
                              <span style={styles.optionName}>{option.name}</span>
                              <span style={styles.optionOdds}>
                                x{Number(option.odds || 1).toFixed(1)}
                              </span>
                            </div>

                            <div style={styles.optionBottom}>
                              <span>{share}% du volume</span>
                              <span>{optionVolume}$</span>
                            </div>

                            {pickedByUser && !bet.resolved ? (
                              <span style={styles.youPicked}>Ton pick</span>
                            ) : null}

                            {isWinner ? (
                              <span style={styles.winnerBadge}>Gagnant</span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>

                    {isAdmin && !bet.resolved && marketOptions.length > 0 && (
                      <div style={styles.resolveRow}>
                        <span style={styles.resolveLabel}>Résoudre :</span>
                        {marketOptions.map((option) => (
                          <button
                            key={option.id}
                            style={styles.smallPrimaryButton}
                            onClick={() => resolveBet(bet, option)}
                          >
                            {option.name}
                          </button>
                        ))}
                      </div>
                    )}

                    <div style={styles.commentsBox}>
                      <h5 style={styles.commentTitle}>Commentaires</h5>
                      <div style={styles.commentInputRow}>
                        <input
                          style={styles.input}
                          placeholder="Lâche ton avis..."
                          value={commentDrafts[bet.id] || ""}
                          onChange={(e) =>
                            setCommentDrafts((current) => ({
                              ...current,
                              [bet.id]: e.target.value,
                            }))
                          }
                        />
                        <button
                          style={styles.smallPrimaryButton}
                          onClick={() => addComment(bet.id)}
                        >
                          Envoyer
                        </button>
                      </div>

                      <div style={styles.commentList}>
                        {(commentsByBet[bet.id] || []).slice(0, 5).map((comment) => (
                          <div key={comment.id} style={styles.commentItem}>
                            <strong>{comment.username}</strong> — {comment.text}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}

              {!loading && visibleBets.length === 0 && (
                <div style={styles.emptyState}>Aucun marché ici pour le moment.</div>
              )}
            </div>
          </div>
        </div>

        <div style={styles.sideColumn}>
          <div style={styles.panelCard}>
            <div style={styles.panelHeader}>
              <div>
                <h3 style={styles.panelTitle}>🏆 Leaderboard</h3>
                <p style={styles.muted}>Classé par argent fictif.</p>
              </div>
            </div>

            <div style={styles.leaderboardList}>
              {leaderboard.map((entry, index) => (
                <div key={entry.name} style={styles.leaderboardItem}>
                  <div style={styles.leaderLeft}>
                    <div style={styles.rankBubble}>{index + 1}</div>
                    <div>
                      <div style={styles.leaderName}>{entry.name}</div>
                      <div style={styles.leaderSub}>{entry.played} pari(s)</div>
                    </div>
                  </div>
                  <div style={styles.leaderScore}>{entry.money}$</div>
                </div>
              ))}

              {leaderboard.length === 0 && (
                <div style={styles.emptyState}>Aucun score pour l’instant.</div>
              )}
            </div>
          </div>

          <div style={styles.panelCard}>
            <div style={styles.panelHeader}>
              <div>
                <h3 style={styles.panelTitle}>📊 Ton profil</h3>
                <p style={styles.muted}>Historique, ROI et badges.</p>
              </div>
            </div>

            <div style={styles.profileStats}>
              <div style={styles.statMini}>
                <strong>{userStats.wins}</strong>
                <span>Victoires</span>
              </div>
              <div style={styles.statMini}>
                <strong>{userStats.losses}</strong>
                <span>Défaites</span>
              </div>
              <div style={styles.statMini}>
                <strong>{userStats.roi}%</strong>
                <span>ROI</span>
              </div>
              <div style={styles.statMini}>
                <strong>{userStats.totalProfit}$</strong>
                <span>Profit</span>
              </div>
            </div>

            <div style={styles.badgesWrap}>
              {badges.length > 0 ? (
                badges.map((badge) => (
                  <span key={badge} style={styles.chip}>
                    {badge}
                  </span>
                ))
              ) : (
                <div style={styles.emptyState}>Pas encore de badge.</div>
              )}
            </div>

            <div style={styles.historyWrap}>
              <h4 style={styles.sectionTitle}>Historique</h4>
              {myHistory.slice(0, 8).map((item) => (
                <div key={item.wager.id} style={styles.historyItem}>
                  <div>
                    <div style={styles.historyTitle}>{item.bet.title}</div>
                    <div style={styles.historySub}>
                      {item.option.name} • mise {item.amount}$ • x
                      {Number(item.odds).toFixed(1)}
                    </div>
                  </div>
                  <div
                    style={{
                      ...styles.historyProfit,
                      color: item.bet.resolved
                        ? item.won
                          ? "#7dffbb"
                          : "#ff9b9b"
                        : "#c8d0ea",
                    }}
                  >
                    {item.bet.resolved
                      ? item.won
                        ? `+${item.profit}$`
                        : `${item.profit}$`
                      : "En cours"}
                  </div>
                </div>
              ))}

              {myHistory.length === 0 && (
                <div style={styles.emptyState}>Aucun pari pour l’instant.</div>
              )}
            </div>
          </div>

          <div style={styles.panelCard}>
            <div style={styles.panelHeader}>
              <div>
                <h3 style={styles.panelTitle}>💡 Proposer un pari</h3>
                <p style={styles.muted}>Lâche tes idées à l’admin.</p>
              </div>
            </div>

            <form onSubmit={submitProposal} style={styles.proposalForm}>
              <textarea
                style={styles.textarea}
                placeholder="Ex: Qui sera en retard demain ?"
                value={proposalDraft}
                onChange={(e) => setProposalDraft(e.target.value)}
              />
              <button
                type="submit"
                style={styles.primaryButton}
                disabled={isSubmittingProposal}
              >
                {isSubmittingProposal ? "Envoi..." : "Envoyer l’idée"}
              </button>
            </form>

            <div style={styles.proposalList}>
              {proposals.map((proposal) => (
                <div key={proposal.id} style={styles.proposalItem}>
                  <div>
                    <div style={styles.proposalText}>{proposal.text}</div>
                    <div style={styles.proposalMeta}>par {proposal.username}</div>
                  </div>

                  {isAdmin && (
                    <div style={styles.proposalActions}>
                      <button
                        style={styles.smallPrimaryButton}
                        onClick={() => convertProposalToBet(proposal)}
                      >
                        Utiliser
                      </button>
                      <button
                        style={styles.smallDangerButton}
                        onClick={() => deleteProposal(proposal.id)}
                      >
                        Suppr.
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {proposals.length === 0 && (
                <div style={styles.emptyState}>Aucune proposition.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const globalStyles = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: radial-gradient(circle at top, #131c3b 0%, #070b17 45%, #04060d 100%);
    color: #f5f7ff;
  }
  button, input, textarea, select {
    font: inherit;
  }
`;

const styles = {
  page: {
    minHeight: "100vh",
    padding: "24px",
    background: "transparent",
  },
  loginWrap: {
    minHeight: "calc(100vh - 48px)",
    display: "grid",
    placeItems: "center",
    position: "relative",
    overflow: "hidden",
  },
  glowOrbA: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: "50%",
    background: "rgba(86, 128, 255, 0.2)",
    filter: "blur(40px)",
    top: 60,
    left: 40,
  },
  glowOrbB: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: "50%",
    background: "rgba(25, 230, 160, 0.16)",
    filter: "blur(40px)",
    bottom: 40,
    right: 60,
  },
  loginCard: {
    width: "min(720px, 100%)",
    background: "rgba(9, 13, 25, 0.88)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 28,
    padding: 36,
    backdropFilter: "blur(16px)",
    boxShadow: "0 20px 80px rgba(0,0,0,0.45)",
    position: "relative",
    zIndex: 2,
  },
  centerCard: {
    maxWidth: 720,
    margin: "120px auto",
    background: "rgba(9, 13, 25, 0.88)",
    borderRadius: 24,
    padding: 30,
    border: "1px solid rgba(255,255,255,0.08)",
  },
  heroBadge: {
    display: "inline-flex",
    padding: "8px 14px",
    borderRadius: 999,
    background: "rgba(91, 126, 255, 0.14)",
    color: "#b9c8ff",
    border: "1px solid rgba(91,126,255,0.35)",
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: "clamp(38px, 7vw, 72px)",
    lineHeight: 1,
    margin: "0 0 16px",
    fontWeight: 800,
    letterSpacing: "-0.04em",
  },
  heroText: {
    color: "#a7b1ca",
    fontSize: 18,
    lineHeight: 1.6,
    marginBottom: 24,
  },
  loginForm: {
    display: "grid",
    gap: 12,
    marginBottom: 20,
  },
  loginFeatures: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  },
  chip: {
    borderRadius: 999,
    padding: "8px 12px",
    background: "rgba(255,255,255,0.06)",
    color: "#d9e1ff",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    marginBottom: 24,
    flexWrap: "wrap",
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
  },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(135deg, #89a6ff 0%, #4b6bff 100%)",
    color: "white",
    fontWeight: 800,
    boxShadow: "0 10px 26px rgba(75,107,255,0.35)",
  },
  brand: {
    fontWeight: 800,
    fontSize: 22,
    letterSpacing: "-0.03em",
  },
  brandSub: {
    color: "#8f98b3",
    fontSize: 13,
  },
  topbarRight: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
  },
  userPill: {
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.08)",
    padding: "10px 14px",
    borderRadius: 999,
  },
  heroGrid: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
    gap: 18,
    marginBottom: 20,
  },
  heroCardLarge: {
    padding: 28,
    borderRadius: 28,
    background:
      "linear-gradient(135deg, rgba(18,25,48,0.95) 0%, rgba(8,12,24,0.95) 100%)",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 18px 50px rgba(0,0,0,0.3)",
  },
  heroCardSide: {
    padding: 24,
    borderRadius: 28,
    background:
      "linear-gradient(135deg, rgba(8,42,31,0.95) 0%, rgba(7,13,24,0.95) 100%)",
    border: "1px solid rgba(65,255,180,0.15)",
  },
  heroSmall: {
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    color: "#8aa0ff",
    marginBottom: 12,
  },
  heroBigTitle: {
    fontSize: "clamp(28px, 4vw, 52px)",
    lineHeight: 1,
    margin: "0 0 12px",
    letterSpacing: "-0.05em",
  },
  statRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 12,
    marginTop: 18,
  },
  statBox: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 16,
    borderRadius: 18,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  topPlayerName: {
    fontSize: 28,
    fontWeight: 800,
    marginBottom: 6,
  },
  topPlayerScore: {
    fontSize: 18,
    color: "#44e39f",
    fontWeight: 700,
    marginBottom: 8,
  },
  muted: {
    color: "#98a3bf",
    lineHeight: 1.5,
  },
  contentGrid: {
    display: "grid",
    gridTemplateColumns: "1.6fr 0.9fr",
    gap: 18,
    alignItems: "start",
  },
  mainColumn: {
    display: "grid",
    gap: 18,
  },
  sideColumn: {
    display: "grid",
    gap: 18,
  },
  panelCard: {
    background: "rgba(9, 13, 25, 0.86)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 26,
    padding: 22,
    boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
  },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    marginBottom: 14,
  },
  panelTitle: {
    fontSize: 22,
    margin: 0,
    letterSpacing: "-0.03em",
  },
  adminBadge: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(255,90,90,0.14)",
    border: "1px solid rgba(255,90,90,0.28)",
    color: "#ffbbbb",
    fontWeight: 700,
    fontSize: 12,
  },
  formGrid: {
    display: "grid",
    gap: 12,
  },
  optionRow: {
    display: "flex",
    gap: 10,
  },
  formActions: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  input: {
    width: "100%",
    background: "rgba(255,255,255,0.06)",
    color: "#f5f7ff",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: "14px 16px",
    outline: "none",
  },
  textarea: {
    width: "100%",
    minHeight: 110,
    resize: "vertical",
    background: "rgba(255,255,255,0.06)",
    color: "#f5f7ff",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: "14px 16px",
    outline: "none",
  },
  select: {
    background: "rgba(255,255,255,0.06)",
    color: "#f5f7ff",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 14,
    padding: "12px 14px",
    outline: "none",
  },
  primaryButton: {
    border: "none",
    borderRadius: 16,
    padding: "14px 18px",
    background: "linear-gradient(135deg, #7f95ff 0%, #4f6fff 100%)",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 10px 24px rgba(79,111,255,0.28)",
  },
  smallPrimaryButton: {
    border: "none",
    borderRadius: 12,
    padding: "10px 12px",
    background: "rgba(79,111,255,0.18)",
    color: "#dfe6ff",
    fontWeight: 700,
    cursor: "pointer",
    border: "1px solid rgba(79,111,255,0.3)",
  },
  ghostButton: {
    borderRadius: 16,
    padding: "12px 16px",
    background: "rgba(255,255,255,0.05)",
    color: "#f5f7ff",
    border: "1px solid rgba(255,255,255,0.1)",
    cursor: "pointer",
  },
  smallDangerButton: {
    borderRadius: 12,
    padding: "10px 12px",
    background: "rgba(255,91,91,0.14)",
    color: "#ffc1c1",
    border: "1px solid rgba(255,91,91,0.22)",
    cursor: "pointer",
  },
  filtersRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 16,
  },
  tabRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  tab: {
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "#ccd5f4",
    padding: "10px 14px",
    cursor: "pointer",
  },
  activeTab: {
    borderRadius: 999,
    border: "1px solid rgba(79,111,255,0.3)",
    background: "rgba(79,111,255,0.18)",
    color: "#eef1ff",
    padding: "10px 14px",
    cursor: "pointer",
  },
  searchInput: {
    minWidth: 220,
    background: "rgba(255,255,255,0.06)",
    color: "#f5f7ff",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 999,
    padding: "12px 14px",
    outline: "none",
  },
  marketList: {
    display: "grid",
    gap: 14,
  },
  marketCard: {
    borderRadius: 22,
    padding: 18,
    background:
      "linear-gradient(180deg, rgba(12,18,34,0.95) 0%, rgba(7,11,24,0.95) 100%)",
    border: "1px solid rgba(255,255,255,0.07)",
  },
  marketHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  marketMeta: {
    display: "flex",
    gap: 8,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  openPill: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(68,227,159,0.13)",
    color: "#99f0c9",
    border: "1px solid rgba(68,227,159,0.22)",
    fontSize: 12,
    fontWeight: 700,
  },
  resolvedPill: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(255,173,72,0.14)",
    color: "#ffd4a1",
    border: "1px solid rgba(255,173,72,0.22)",
    fontSize: 12,
    fontWeight: 700,
  },
  marketCount: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.05)",
    color: "#b6bfd9",
    fontSize: 12,
  },
  marketTitle: {
    margin: 0,
    fontSize: 24,
    letterSpacing: "-0.03em",
  },
  betAmountRow: {
    marginBottom: 14,
  },
  optionsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 12,
  },
  optionCard: {
    textAlign: "left",
    borderRadius: 18,
    padding: 16,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "#f5f7ff",
    cursor: "pointer",
    position: "relative",
    minHeight: 112,
  },
  optionCardPicked: {
    border: "1px solid rgba(79,111,255,0.5)",
    background: "rgba(79,111,255,0.14)",
    boxShadow: "inset 0 0 0 1px rgba(79,111,255,0.16)",
  },
  optionCardWinner: {
    border: "1px solid rgba(68,227,159,0.45)",
    background: "rgba(68,227,159,0.12)",
  },
  optionTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 18,
    alignItems: "center",
  },
  optionName: {
    fontWeight: 700,
    fontSize: 18,
  },
  optionOdds: {
    color: "#8ff2c4",
    fontWeight: 800,
  },
  optionBottom: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    color: "#9aa5c3",
    fontSize: 13,
  },
  youPicked: {
    position: "absolute",
    top: 12,
    right: 12,
    fontSize: 11,
    padding: "6px 8px",
    borderRadius: 999,
    background: "rgba(79,111,255,0.2)",
    color: "#dce4ff",
  },
  winnerBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    fontSize: 11,
    padding: "6px 8px",
    borderRadius: 999,
    background: "rgba(68,227,159,0.2)",
    color: "#d9ffed",
  },
  resolveRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
    alignItems: "center",
  },
  resolveLabel: {
    color: "#9aa5c3",
    marginRight: 6,
  },
  commentsBox: {
    marginTop: 16,
    paddingTop: 14,
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },
  commentTitle: {
    margin: "0 0 10px",
    fontSize: 16,
  },
  commentInputRow: {
    display: "flex",
    gap: 8,
    marginBottom: 10,
  },
  commentList: {
    display: "grid",
    gap: 8,
  },
  commentItem: {
    padding: "10px 12px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.04)",
    color: "#dbe3ff",
  },
  leaderboardList: {
    display: "grid",
    gap: 10,
  },
  leaderboardItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    padding: 14,
    borderRadius: 18,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  leaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  rankBubble: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.08)",
    color: "#eef2ff",
    fontWeight: 800,
  },
  leaderName: {
    fontWeight: 700,
  },
  leaderSub: {
    color: "#98a3bf",
    fontSize: 12,
  },
  leaderScore: {
    fontWeight: 800,
    color: "#9cf2cb",
  },
  proposalForm: {
    display: "grid",
    gap: 12,
    marginBottom: 16,
  },
  proposalList: {
    display: "grid",
    gap: 10,
  },
  proposalItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  proposalText: {
    fontWeight: 700,
    marginBottom: 4,
  },
  proposalMeta: {
    color: "#98a3bf",
    fontSize: 12,
  },
  proposalActions: {
    display: "flex",
    gap: 8,
    alignItems: "start",
  },
  profileStats: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 10,
    marginBottom: 14,
  },
  statMini: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: 12,
    borderRadius: 14,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  badgesWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  historyWrap: {
    display: "grid",
    gap: 10,
  },
  sectionTitle: {
    margin: "0 0 6px",
  },
  historyItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  historyTitle: {
    fontWeight: 700,
  },
  historySub: {
    color: "#98a3bf",
    fontSize: 12,
  },
  historyProfit: {
    fontWeight: 800,
  },
  loadingBox: {
    padding: 16,
    borderRadius: 18,
    background: "rgba(255,255,255,0.04)",
    marginBottom: 12,
  },
  errorBanner: {
    marginBottom: 18,
    padding: 14,
    borderRadius: 18,
    background: "rgba(255,91,91,0.14)",
    border: "1px solid rgba(255,91,91,0.22)",
    color: "#ffd5d5",
  },
  emptyState: {
    padding: 20,
    borderRadius: 18,
    background: "rgba(255,255,255,0.04)",
    border: "1px dashed rgba(255,255,255,0.12)",
    color: "#9aa5c3",
    textAlign: "center",
  },
};