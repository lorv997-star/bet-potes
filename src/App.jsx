import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STARTING_MONEY = 1000;
const ADMIN_CODE = "betboss";
const AUTO_ADMIN_USERS = ["tim", "Tim", "lory997-star"];

const TABS = [
  { key: "markets", label: "Marchés" },
  { key: "leaderboard", label: "Leaderboard" },
  { key: "profile", label: "Mon profil" },
  { key: "proposals", label: "Proposer" },
  { key: "admin", label: "Admin" },
];

const DEFAULT_MARKET_FORM = {
  title: "",
  category: "Fun",
  closes_at: "",
  options: [
    { name: "Oui", odds: 1.8 },
    { name: "Non", odds: 2.1 },
  ],
};

function formatMoney(value) {
  return `${Number(value || 0)}$`;
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR");
}

function isClosedMarket(market) {
  if (!market) return false;
  if (market.resolved) return true;
  if (!market.closes_at) return false;
  return new Date(market.closes_at).getTime() <= Date.now();
}

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getBadgeColor(label) {
  if (label.includes("GOAT")) return "gold";
  if (label.includes("ROI")) return "green";
  if (label.includes("Sniper")) return "blue";
  if (label.includes("Cash")) return "emerald";
  return "default";
}

export default function App() {
  const [activeTab, setActiveTab] = useState("markets");
  const [authMode, setAuthMode] = useState("login");
  const [sessionUser, setSessionUser] = useState(
    localStorage.getItem("bet-potes-user") || ""
  );

  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  const [unlockAdmin, setUnlockAdmin] = useState(false);

  const [markets, setMarkets] = useState([]);
  const [options, setOptions] = useState([]);
  const [wagers, setWagers] = useState([]);
  const [scores, setScores] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [comments, setComments] = useState([]);

  const [marketForm, setMarketForm] = useState(DEFAULT_MARKET_FORM);
  const [proposalDraft, setProposalDraft] = useState("");
  const [commentDrafts, setCommentDrafts] = useState({});
  const [amountDrafts, setAmountDrafts] = useState({});

  const [marketStatusFilter, setMarketStatusFilter] = useState("open");
  const [marketCategoryFilter, setMarketCategoryFilter] = useState("Toutes");
  const [marketSort, setMarketSort] = useState("newest");
  const [marketSearch, setMarketSearch] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmittingMarket, setIsSubmittingMarket] = useState(false);
  const [isSubmittingProposal, setIsSubmittingProposal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const isConfigured =
    !!SUPABASE_URL &&
    !!SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes("YOUR_PROJECT") &&
    !SUPABASE_ANON_KEY.includes("YOUR_PUBLISHABLE_KEY");

  const isAdmin =
    unlockAdmin || AUTO_ADMIN_USERS.includes((sessionUser || "").trim());

  useEffect(() => {
    if (!isConfigured || !sessionUser) return;
    loadAll();

    const channel = supabase
      .channel("bet-potes-live-v2")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "markets" },
        () => loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "market_options" },
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
  }, [sessionUser, isConfigured]);

  async function loadAll() {
    setIsLoading(true);
    setErrorMessage("");

    const [
      marketsRes,
      optionsRes,
      wagersRes,
      scoresRes,
      proposalsRes,
      commentsRes,
    ] = await Promise.all([
      supabase.from("markets").select("*").order("id", { ascending: false }),
      supabase.from("market_options").select("*").order("id", { ascending: true }),
      supabase.from("wagers").select("*").order("id", { ascending: false }),
      supabase.from("scores").select("*"),
      supabase.from("proposals").select("*").order("id", { ascending: false }),
      supabase.from("comments").select("*").order("id", { ascending: false }),
    ]);

    const firstError =
      marketsRes.error ||
      optionsRes.error ||
      wagersRes.error ||
      scoresRes.error ||
      proposalsRes.error ||
      commentsRes.error;

    if (firstError) setErrorMessage(firstError.message);

    setMarkets(marketsRes.data || []);
    setOptions(optionsRes.data || []);
    setWagers(wagersRes.data || []);
    setScores(scoresRes.data || []);
    setProposals(proposalsRes.data || []);
    setComments(commentsRes.data || []);
    setIsLoading(false);
  }

  const optionsByMarket = useMemo(() => {
    const map = {};
    options.forEach((option) => {
      if (!map[option.market_id]) map[option.market_id] = [];
      map[option.market_id].push(option);
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

  const commentsByMarket = useMemo(() => {
    const map = {};
    comments.forEach((comment) => {
      if (!map[comment.market_id]) map[comment.market_id] = [];
      map[comment.market_id].push(comment);
    });
    return map;
  }, [comments]);

  const scoreMap = useMemo(() => {
    const map = new Map();
    scores.forEach((score) => map.set(score.username, score));
    return map;
  }, [scores]);

  const currentProfile =
    scoreMap.get(sessionUser) || {
      username: sessionUser,
      score: 0,
      money: STARTING_MONEY,
      wins: 0,
      losses: 0,
    };

  const categories = useMemo(() => {
    const set = new Set(["Toutes"]);
    markets.forEach((m) => set.add(m.category || "Fun"));
    return [...set];
  }, [markets]);

  const marketStats = useMemo(() => {
    const openCount = markets.filter((m) => !isClosedMarket(m)).length;
    const resolvedCount = markets.filter((m) => m.resolved).length;
    const activeUsers = new Set(wagers.map((w) => w.username));
    if (sessionUser) activeUsers.add(sessionUser);

    const totalVolume = wagers.reduce(
      (sum, wager) => sum + Number(wager.amount || 0),
      0
    );

    return {
      openCount,
      resolvedCount,
      activeUsers: activeUsers.size,
      totalVolume,
    };
  }, [markets, wagers, sessionUser]);

  const marketMap = useMemo(
    () => new Map(markets.map((market) => [market.id, market])),
    [markets]
  );

  const optionMap = useMemo(
    () => new Map(options.map((option) => [option.id, option])),
    [options]
  );

  const myHistory = useMemo(() => {
    return wagers
      .filter((w) => w.username === sessionUser)
      .map((wager) => {
        const option = optionMap.get(wager.option_id);
        const market = option ? marketMap.get(option.market_id) : null;
        const won = market?.winning_option_id === option?.id;
        const amount = Number(wager.amount || 0);
        const odds = Number(option?.odds || 1);
        const grossReturn = Math.round(amount * odds);
        const netProfit = won ? grossReturn - amount : -amount;

        return {
          wager,
          option,
          market,
          won,
          amount,
          odds,
          netProfit,
        };
      })
      .filter((item) => item.market && item.option)
      .sort((a, b) => b.wager.id - a.wager.id);
  }, [wagers, optionMap, marketMap, sessionUser]);

  const myStats = useMemo(() => {
    const resolved = myHistory.filter((item) => item.market?.resolved);
    const wins = resolved.filter((item) => item.won).length;
    const losses = resolved.filter((item) => !item.won).length;
    const totalStaked = myHistory.reduce((sum, item) => sum + item.amount, 0);
    const totalProfit = resolved.reduce((sum, item) => sum + item.netProfit, 0);
    const roi = totalStaked > 0 ? Math.round((totalProfit / totalStaked) * 100) : 0;

    return {
      wins,
      losses,
      totalStaked,
      totalProfit,
      roi,
    };
  }, [myHistory]);

  const leaderboard = useMemo(() => {
    const names = new Set(scores.map((s) => s.username));
    wagers.forEach((w) => names.add(w.username));
    if (sessionUser) names.add(sessionUser);

    return [...names]
      .map((name) => {
        const profile = scoreMap.get(name) || {
          username: name,
          money: STARTING_MONEY,
          score: 0,
          wins: 0,
          losses: 0,
        };

        const playerWagers = wagers.filter((w) => w.username === name);
        return {
          name,
          money: Number(profile.money || STARTING_MONEY),
          score: Number(profile.score || 0),
          wins: Number(profile.wins || 0),
          losses: Number(profile.losses || 0),
          betsCount: playerWagers.length,
        };
      })
      .sort(
        (a, b) =>
          b.money - a.money ||
          b.score - a.score ||
          b.wins - a.wins ||
          a.name.localeCompare(b.name)
      );
  }, [scores, wagers, sessionUser, scoreMap]);

  const topPlayer = leaderboard[0];

  const badges = useMemo(() => {
    const result = [];
    if (leaderboard[0]?.name === sessionUser) result.push("🐐 GOAT");
    if ((currentProfile.money || 0) >= 1500) result.push("💰 Cash machine");
    if (myStats.wins >= 5) result.push("🧠 Pro bettor");
    if (myStats.roi >= 25 && myStats.totalStaked >= 200) result.push("📈 ROI monster");
    if (
      myHistory.some(
        (item) => item.market?.resolved && item.won && Number(item.odds) >= 3
      )
    ) {
      result.push("🎯 Sniper grosse cote");
    }
    if (
      myHistory.some(
        (item) => item.market?.resolved && !item.won && item.amount >= 500
      )
    ) {
      result.push("💀 All-in raté");
    }
    if (myHistory.length >= 10) result.push("🔥 Volume trader");
    return result;
  }, [leaderboard, sessionUser, currentProfile, myStats, myHistory]);

  const featuredMarket = useMemo(() => {
    const openMarkets = markets.filter((m) => !isClosedMarket(m));
    if (openMarkets.length === 0) return markets[0] || null;
    return [...openMarkets].sort((a, b) => getMarketVolume(b.id) - getMarketVolume(a.id))[0];
  }, [markets, options, wagers]);

  const filteredMarkets = useMemo(() => {
    let data = [...markets];

    data = data.filter((market) => {
      const matchesStatus =
        marketStatusFilter === "all"
          ? true
          : marketStatusFilter === "open"
          ? !isClosedMarket(market)
          : market.resolved;

      const matchesCategory =
        marketCategoryFilter === "Toutes"
          ? true
          : (market.category || "Fun") === marketCategoryFilter;

      const matchesSearch = market.title
        .toLowerCase()
        .includes(marketSearch.toLowerCase());

      return matchesStatus && matchesCategory && matchesSearch;
    });

    if (marketSort === "newest") data.sort((a, b) => b.id - a.id);
    if (marketSort === "oldest") data.sort((a, b) => a.id - b.id);
    if (marketSort === "volume") {
      data.sort((a, b) => getMarketVolume(b.id) - getMarketVolume(a.id));
    }

    return data;
  }, [
    markets,
    marketStatusFilter,
    marketCategoryFilter,
    marketSearch,
    marketSort,
    options,
    wagers,
  ]);

  async function ensureScoreProfile(username) {
    if (!username) return;
    const existing = scoreMap.get(username);
    if (!existing) {
      await supabase.from("scores").upsert({
        username,
        score: 0,
        money: STARTING_MONEY,
        wins: 0,
        losses: 0,
      });
    }
  }

  async function register() {
    setErrorMessage("");
    setSuccessMessage("");

    const cleanUsername = authUsername.trim();
    const cleanPassword = authPassword.trim();

    if (!cleanUsername || !cleanPassword) {
      setErrorMessage("Entre un pseudo et un mot de passe.");
      return;
    }

    const hashed = await hashPassword(cleanPassword);

    const { error: userError } = await supabase.from("users").insert({
      username: cleanUsername,
      password_hash: hashed,
    });

    if (userError) {
      setErrorMessage("Pseudo déjà pris ou erreur d'inscription.");
      return;
    }

    await supabase.from("scores").upsert({
      username: cleanUsername,
      score: 0,
      money: STARTING_MONEY,
      wins: 0,
      losses: 0,
    });

    localStorage.setItem("bet-potes-user", cleanUsername);
    setSessionUser(cleanUsername);
    setAuthUsername("");
    setAuthPassword("");
    setSuccessMessage("Compte créé avec succès.");
    await loadAll();
  }

  async function login() {
    setErrorMessage("");
    setSuccessMessage("");

    const cleanUsername = authUsername.trim();
    const cleanPassword = authPassword.trim();

    if (!cleanUsername || !cleanPassword) {
      setErrorMessage("Entre ton pseudo et ton mot de passe.");
      return;
    }

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", cleanUsername)
      .single();

    if (error || !data) {
      setErrorMessage("Utilisateur introuvable.");
      return;
    }

    const hashed = await hashPassword(cleanPassword);

    if (data.password_hash !== hashed) {
      setErrorMessage("Mot de passe incorrect.");
      return;
    }

    localStorage.setItem("bet-potes-user", cleanUsername);
    setSessionUser(cleanUsername);
    setAuthUsername("");
    setAuthPassword("");
    await ensureScoreProfile(cleanUsername);
    await loadAll();
  }

  function logout() {
    localStorage.removeItem("bet-potes-user");
    setSessionUser("");
    setUnlockAdmin(false);
    setActiveTab("markets");
  }

  function getMarketVolume(marketId) {
    const marketOptions = optionsByMarket[marketId] || [];
    return marketOptions.reduce((sum, option) => {
      const optionWagers = wagersByOption[option.id] || [];
      return (
        sum +
        optionWagers.reduce(
          (acc, wager) => acc + Number(wager.amount || 0),
          0
        )
      );
    }, 0);
  }

  function updateMarketOption(index, field, value) {
    setMarketForm((current) => ({
      ...current,
      options: current.options.map((opt, i) =>
        i === index ? { ...opt, [field]: value } : opt
      ),
    }));
  }

  function addMarketOptionField() {
    setMarketForm((current) => ({
      ...current,
      options: [...current.options, { name: "", odds: 2 }],
    }));
  }

  function removeMarketOptionField(index) {
    setMarketForm((current) => ({
      ...current,
      options: current.options.filter((_, i) => i !== index),
    }));
  }

  async function createMarket(e) {
    e.preventDefault();
    if (!isAdmin) return;

    setErrorMessage("");
    setSuccessMessage("");
    setIsSubmittingMarket(true);

    const title = marketForm.title.trim();
    const category = marketForm.category.trim() || "Fun";
    const cleanedOptions = marketForm.options
      .map((opt) => ({
        name: opt.name.trim(),
        odds: Number(opt.odds) || 1,
      }))
      .filter((opt) => opt.name);

    if (!title || cleanedOptions.length < 2) {
      setErrorMessage("Ajoute un titre et au moins 2 options.");
      setIsSubmittingMarket(false);
      return;
    }

    const { data: insertedMarket, error: marketError } = await supabase
      .from("markets")
      .insert({
        title,
        category,
        resolved: false,
        closes_at: marketForm.closes_at
          ? new Date(marketForm.closes_at).toISOString()
          : null,
        created_by: sessionUser,
      })
      .select()
      .single();

    if (marketError) {
      setErrorMessage(marketError.message);
      setIsSubmittingMarket(false);
      return;
    }

    const { error: optionsError } = await supabase.from("market_options").insert(
      cleanedOptions.map((opt) => ({
        market_id: insertedMarket.id,
        name: opt.name,
        odds: opt.odds,
      }))
    );

    if (optionsError) {
      setErrorMessage(optionsError.message);
      setIsSubmittingMarket(false);
      return;
    }

    setMarketForm(DEFAULT_MARKET_FORM);
    setSuccessMessage("Marché créé.");
    setIsSubmittingMarket(false);
    setActiveTab("markets");
    await loadAll();
  }

  async function placeBet(market, option) {
    setErrorMessage("");
    setSuccessMessage("");

    if (!sessionUser) {
      setErrorMessage("Connecte-toi pour parier.");
      return;
    }

    if (isClosedMarket(market)) {
      setErrorMessage("Ce marché est fermé.");
      return;
    }

    await ensureScoreProfile(sessionUser);

    const amount = Number(amountDrafts[market.id] || 0);

    if (!amount || amount <= 0) {
      setErrorMessage("Entre une mise valide.");
      return;
    }

    if (amount > Number(currentProfile.money || 0)) {
      setErrorMessage("Tu n'as pas assez d'argent fictif.");
      return;
    }

    const marketOptionIds = (optionsByMarket[market.id] || []).map((o) => o.id);
    const alreadyBet = wagers.some(
      (w) => w.username === sessionUser && marketOptionIds.includes(w.option_id)
    );

    if (alreadyBet) {
      setErrorMessage("Tu as déjà une position sur ce marché.");
      return;
    }

    const { error: wagerError } = await supabase.from("wagers").insert({
      username: sessionUser,
      market_id: market.id,
      option_id: option.id,
      amount,
    });

    if (wagerError) {
      setErrorMessage(wagerError.message);
      return;
    }

    await supabase.from("scores").upsert({
      username: sessionUser,
      score: Number(currentProfile.score || 0),
      money: Number(currentProfile.money || 0) - amount,
      wins: Number(currentProfile.wins || 0),
      losses: Number(currentProfile.losses || 0),
    });

    setAmountDrafts((current) => ({ ...current, [market.id]: "" }));
    setSuccessMessage("Pari placé.");
    await loadAll();
  }

  async function resolveMarket(market, winningOption) {
    if (!isAdmin || market.resolved) return;

    setErrorMessage("");
    setSuccessMessage("");

    const marketOptions = optionsByMarket[market.id] || [];
    const optionIds = marketOptions.map((opt) => opt.id);
    const marketWagers = wagers.filter((w) => optionIds.includes(w.option_id));

    const localScoreMap = new Map(scores.map((score) => [score.username, { ...score }]));

    marketWagers.forEach((wager) => {
      const option = marketOptions.find((opt) => opt.id === wager.option_id);
      const profile = localScoreMap.get(wager.username) || {
        username: wager.username,
        score: 0,
        money: STARTING_MONEY,
        wins: 0,
        losses: 0,
      };

      if (wager.option_id === winningOption.id) {
        const grossReturn = Math.round(
          Number(wager.amount || 0) * Number(option?.odds || 1)
        );
        const bonusScore = Math.max(10, Math.round(10 * Number(option?.odds || 1)));

        profile.money = Number(profile.money || 0) + grossReturn;
        profile.score = Number(profile.score || 0) + bonusScore;
        profile.wins = Number(profile.wins || 0) + 1;
      } else {
        profile.losses = Number(profile.losses || 0) + 1;
      }

      localScoreMap.set(wager.username, profile);
    });

    const { error: marketError } = await supabase
      .from("markets")
      .update({
        resolved: true,
        winning_option_id: winningOption.id,
      })
      .eq("id", market.id);

    if (marketError) {
      setErrorMessage(marketError.message);
      return;
    }

    const { error: scoresError } = await supabase
      .from("scores")
      .upsert([...localScoreMap.values()]);

    if (scoresError) {
      setErrorMessage(scoresError.message);
      return;
    }

    setSuccessMessage("Marché résolu.");
    await loadAll();
  }

  async function submitProposal(e) {
    e.preventDefault();
    if (!proposalDraft.trim() || !sessionUser) return;

    setIsSubmittingProposal(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase.from("proposals").insert({
      username: sessionUser,
      text: proposalDraft.trim(),
    });

    if (error) {
      setErrorMessage(error.message);
    } else {
      setProposalDraft("");
      setSuccessMessage("Proposition envoyée.");
    }

    setIsSubmittingProposal(false);
    await loadAll();
  }

  async function deleteProposal(id) {
    if (!isAdmin) return;
    await supabase.from("proposals").delete().eq("id", id);
    await loadAll();
  }

  function convertProposalToMarket(proposal) {
    if (!isAdmin) return;
    setMarketForm({
      title: proposal.text,
      category: "Fun",
      closes_at: "",
      options: [
        { name: "Oui", odds: 1.8 },
        { name: "Non", odds: 2.1 },
      ],
    });
    setActiveTab("admin");
  }

  async function addComment(marketId) {
    if (!sessionUser) return;
    const text = (commentDrafts[marketId] || "").trim();
    if (!text) return;

    const { error } = await supabase.from("comments").insert({
      market_id: marketId,
      username: sessionUser,
      text,
    });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setCommentDrafts((current) => ({ ...current, [marketId]: "" }));
    await loadAll();
  }

  async function resetSeason() {
    if (!isAdmin) return;

    const ok = window.confirm(
      "Reset saison ? Tous les wallets reviennent à 1000$, les scores à 0, les wagers sont vidés."
    );
    if (!ok) return;

    const usernames = new Set([
      ...scores.map((s) => s.username),
      ...wagers.map((w) => w.username),
    ]);

    if (usernames.size > 0) {
      await supabase.from("scores").upsert(
        [...usernames].map((username) => ({
          username,
          money: STARTING_MONEY,
          score: 0,
          wins: 0,
          losses: 0,
        }))
      );
    }

    await supabase.from("wagers").delete().neq("id", -1);
    setSuccessMessage("Saison réinitialisée.");
    await loadAll();
  }

  function tryUnlockAdmin() {
    const code = window.prompt("Code admin ?");
    if (code === ADMIN_CODE) {
      setUnlockAdmin(true);
      setSuccessMessage("Mode admin activé.");
    } else if (code) {
      setErrorMessage("Code admin incorrect.");
    }
  }

  const tabsToShow = isAdmin ? TABS : TABS.filter((tab) => tab.key !== "admin");

  if (!isConfigured) {
    return (
      <div style={styles.page}>
        <style>{globalStyles}</style>
        <div style={styles.authWrap}>
          <div style={styles.authCard}>
            <h1 style={styles.authTitle}>Configuration requise</h1>
            <p style={styles.heroText}>
              Ajoute <strong>VITE_SUPABASE_URL</strong> et{" "}
              <strong>VITE_SUPABASE_ANON_KEY</strong>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!sessionUser) {
    return (
      <div style={styles.page}>
        <style>{globalStyles}</style>
        <div style={styles.authWrap}>
          <div style={styles.authCard}>
            <div style={styles.authTag}>Version finale</div>
            <h1 style={styles.authTitle}>Bet entre potes</h1>
            <p style={styles.heroText}>
              Marchés privés entre potes, bankroll fictive, commentaires,
              badges, historique, leaderboard et admin.
            </p>

            <div style={styles.authSwitch}>
              <button
                style={authMode === "login" ? styles.activeMiniTab : styles.miniTab}
                onClick={() => setAuthMode("login")}
              >
                Connexion
              </button>
              <button
                style={authMode === "register" ? styles.activeMiniTab : styles.miniTab}
                onClick={() => setAuthMode("register")}
              >
                Créer un compte
              </button>
            </div>

            <div style={styles.authForm}>
              <input
                style={styles.input}
                placeholder="Pseudo"
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
              />
              <input
                style={styles.input}
                type="password"
                placeholder="Mot de passe"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
              />

              {errorMessage ? <div style={styles.errorBanner}>{errorMessage}</div> : null}
              {successMessage ? (
                <div style={styles.successBanner}>{successMessage}</div>
              ) : null}

              <button
                style={styles.primaryButton}
                onClick={authMode === "login" ? login : register}
              >
                {authMode === "login" ? "Connexion" : "Créer le compte"}
              </button>
            </div>

            <div style={styles.authChipRow}>
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

      <header style={styles.header}>
        <div style={styles.logoRow}>
          <div style={styles.logoBox}>◆</div>
          <div>
            <div style={styles.brand}>Bet entre potes</div>
            <div style={styles.brandSub}>private market • v2 pro</div>
          </div>
        </div>

        <div style={styles.headerRight}>
          <div style={styles.statPill}>👤 {sessionUser}</div>
          <div style={styles.statPill}>💸 {formatMoney(currentProfile.money)}</div>
          <div style={styles.statPill}>🏆 {currentProfile.score || 0} pts</div>
          {!isAdmin ? (
            <button style={styles.secondaryButton} onClick={tryUnlockAdmin}>
              Débloquer admin
            </button>
          ) : (
            <div style={styles.adminPill}>ADMIN</div>
          )}
          <button style={styles.secondaryButton} onClick={logout}>
            Déconnexion
          </button>
        </div>
      </header>

      <section style={styles.heroPanel}>
        <div style={styles.heroLeft}>
          <div style={styles.heroEyebrow}>Marché du moment</div>
          <h2 style={styles.heroTitle}>
            Parie, propose, grimpe au classement.
          </h2>
          <p style={styles.heroTextLarge}>
            Une interface plus propre, plus premium, pensée pour le chaos entre potes.
          </p>

          <div style={styles.heroStats}>
            <div style={styles.heroStatCard}>
              <strong>{marketStats.openCount}</strong>
              <span>Marchés ouverts</span>
            </div>
            <div style={styles.heroStatCard}>
              <strong>{marketStats.activeUsers}</strong>
              <span>Joueurs actifs</span>
            </div>
            <div style={styles.heroStatCard}>
              <strong>{formatMoney(marketStats.totalVolume)}</strong>
              <span>Volume total</span>
            </div>
          </div>
        </div>

        <div style={styles.heroRight}>
          <div style={styles.featureLabel}>Marché vedette</div>
          {featuredMarket ? (
            <>
              <div style={styles.featureTitle}>{featuredMarket.title}</div>
              <div style={styles.featureMetaRow}>
                <span style={styles.mutedPill}>{featuredMarket.category || "Fun"}</span>
                <span style={styles.mutedPill}>
                  {formatMoney(getMarketVolume(featuredMarket.id))}
                </span>
              </div>
              <div style={styles.featureFooter}>
                {topPlayer ? (
                  <>
                    <span style={styles.topLabel}>Top joueur</span>
                    <strong style={styles.topValue}>
                      {topPlayer.name} · {formatMoney(topPlayer.money)}
                    </strong>
                  </>
                ) : (
                  <span style={styles.topLabel}>Pas encore de top joueur</span>
                )}
              </div>
            </>
          ) : (
            <div style={styles.emptyMini}>Aucun marché vedette pour l’instant.</div>
          )}
        </div>
      </section>

      <nav style={styles.navbar}>
        {tabsToShow.map((tab) => (
          <button
            key={tab.key}
            style={activeTab === tab.key ? styles.activeNavButton : styles.navButton}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {errorMessage ? <div style={styles.errorBanner}>{errorMessage}</div> : null}
      {successMessage ? <div style={styles.successBanner}>{successMessage}</div> : null}

      {activeTab === "markets" && (
        <div style={styles.pageGrid}>
          <div style={styles.mainColumn}>
            <section style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h3 style={styles.cardTitle}>Marchés</h3>
                  <p style={styles.cardSub}>
                    Choisis une position, mets un montant, et fais grossir ta bankroll.
                  </p>
                </div>
              </div>

              <div style={styles.filtersBlock}>
                <div style={styles.filterTabs}>
                  <button
                    style={
                      marketStatusFilter === "open" ? styles.activeMiniTab : styles.miniTab
                    }
                    onClick={() => setMarketStatusFilter("open")}
                  >
                    Ouverts
                  </button>
                  <button
                    style={
                      marketStatusFilter === "resolved"
                        ? styles.activeMiniTab
                        : styles.miniTab
                    }
                    onClick={() => setMarketStatusFilter("resolved")}
                  >
                    Résolus
                  </button>
                  <button
                    style={
                      marketStatusFilter === "all" ? styles.activeMiniTab : styles.miniTab
                    }
                    onClick={() => setMarketStatusFilter("all")}
                  >
                    Tous
                  </button>
                </div>

                <div style={styles.filterGrid}>
                  <select
                    style={styles.select}
                    value={marketCategoryFilter}
                    onChange={(e) => setMarketCategoryFilter(e.target.value)}
                  >
                    {categories.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>

                  <select
                    style={styles.select}
                    value={marketSort}
                    onChange={(e) => setMarketSort(e.target.value)}
                  >
                    <option value="newest">Plus récents</option>
                    <option value="oldest">Plus anciens</option>
                    <option value="volume">Plus de volume</option>
                  </select>

                  <input
                    style={styles.searchInput}
                    placeholder="Rechercher un marché"
                    value={marketSearch}
                    onChange={(e) => setMarketSearch(e.target.value)}
                  />
                </div>
              </div>

              {isLoading ? <div style={styles.loadingCard}>Chargement...</div> : null}

              <div style={styles.marketList}>
                {filteredMarkets.map((market) => {
                  const marketOptions = optionsByMarket[market.id] || [];
                  const totalVolume = getMarketVolume(market.id);
                  const closed = isClosedMarket(market);

                  return (
                    <div key={market.id} style={styles.marketCard}>
                      <div style={styles.marketTopRow}>
                        <div style={styles.marketPills}>
                          <span style={market.resolved ? styles.resolvedPill : styles.openPill}>
                            {market.resolved ? "Résolu" : closed ? "Fermé" : "Ouvert"}
                          </span>
                          <span style={styles.neutralPill}>
                            {(market.category || "Fun").toUpperCase()}
                          </span>
                          <span style={styles.neutralPill}>
                            Volume {formatMoney(totalVolume)}
                          </span>
                        </div>

                        <div style={styles.marketEnd}>Fin : {formatDate(market.closes_at)}</div>
                      </div>

                      <h4 style={styles.marketName}>{market.title}</h4>

                      {!closed ? (
                        <input
                          style={styles.input}
                          type="number"
                          min="1"
                          placeholder="Montant à miser"
                          value={amountDrafts[market.id] || ""}
                          onChange={(e) =>
                            setAmountDrafts((current) => ({
                              ...current,
                              [market.id]: e.target.value,
                            }))
                          }
                        />
                      ) : (
                        <div style={styles.closedBox}>
                          {market.resolved
                            ? "Marché résolu"
                            : "Marché fermé, les mises sont bloquées"}
                        </div>
                      )}

                      <div style={styles.optionsGrid}>
                        {marketOptions.map((option) => {
                          const optionWagers = wagersByOption[option.id] || [];
                          const optionVolume = optionWagers.reduce(
                            (sum, wager) => sum + Number(wager.amount || 0),
                            0
                          );
                          const percentage =
                            totalVolume > 0 ? Math.round((optionVolume / totalVolume) * 100) : 0;

                          const pickedByMe = optionWagers.some(
                            (wager) => wager.username === sessionUser
                          );

                          const isWinner = market.winning_option_id === option.id;

                          return (
                            <button
                              key={option.id}
                              style={{
                                ...styles.optionCard,
                                ...(pickedByMe ? styles.optionCardPicked : {}),
                                ...(isWinner ? styles.optionCardWinner : {}),
                              }}
                              disabled={closed}
                              onClick={() => placeBet(market, option)}
                            >
                              <div style={styles.optionCardTop}>
                                <span style={styles.optionLabel}>{option.name}</span>
                                <span style={styles.optionPrice}>
                                  x{Number(option.odds || 1).toFixed(1)}
                                </span>
                              </div>

                              <div style={styles.optionCardBottom}>
                                <span>{percentage}% du volume</span>
                                <span>{formatMoney(optionVolume)}</span>
                              </div>

                              {pickedByMe && !market.resolved ? (
                                <span style={styles.smallBadgeBlue}>Ton pick</span>
                              ) : null}

                              {isWinner ? (
                                <span style={styles.smallBadgeGreen}>Gagnant</span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>

                      {isAdmin && !market.resolved && marketOptions.length > 0 ? (
                        <div style={styles.resolveRow}>
                          <span style={styles.resolveText}>Résoudre :</span>
                          {marketOptions.map((option) => (
                            <button
                              key={option.id}
                              style={styles.smallButton}
                              onClick={() => resolveMarket(market, option)}
                            >
                              {option.name}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      <div style={styles.commentSection}>
                        <div style={styles.commentHeader}>Commentaires</div>
                        <div style={styles.commentInputRow}>
                          <input
                            style={styles.input}
                            placeholder="Lâche ton avis"
                            value={commentDrafts[market.id] || ""}
                            onChange={(e) =>
                              setCommentDrafts((current) => ({
                                ...current,
                                [market.id]: e.target.value,
                              }))
                            }
                          />
                          <button
                            style={styles.smallButton}
                            onClick={() => addComment(market.id)}
                          >
                            Envoyer
                          </button>
                        </div>

                        <div style={styles.commentList}>
                          {(commentsByMarket[market.id] || []).slice(0, 6).map((comment) => (
                            <div key={comment.id} style={styles.commentItem}>
                              <strong>{comment.username}</strong> — {comment.text}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {!isLoading && filteredMarkets.length === 0 ? (
                  <div style={styles.emptyBlock}>Aucun marché pour l’instant.</div>
                ) : null}
              </div>
            </section>
          </div>

          <div style={styles.sideColumn}>
            <section style={styles.card}>
              <h3 style={styles.cardTitle}>Résumé rapide</h3>
              <div style={styles.quickStats}>
                <div style={styles.quickStat}>
                  <strong>{formatMoney(currentProfile.money)}</strong>
                  <span>Wallet</span>
                </div>
                <div style={styles.quickStat}>
                  <strong>{currentProfile.score || 0}</strong>
                  <span>Score</span>
                </div>
                <div style={styles.quickStat}>
                  <strong>{myStats.roi}%</strong>
                  <span>ROI</span>
                </div>
              </div>
            </section>

            <section style={styles.card}>
              <h3 style={styles.cardTitle}>Top 5</h3>
              <div style={styles.topMiniList}>
                {leaderboard.slice(0, 5).map((player, index) => (
                  <div key={player.name} style={styles.topMiniItem}>
                    <span>#{index + 1} {player.name}</span>
                    <strong>{formatMoney(player.money)}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      {activeTab === "leaderboard" && (
        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h3 style={styles.cardTitle}>Leaderboard</h3>
              <p style={styles.cardSub}>Classé par bankroll puis score.</p>
            </div>
          </div>

          <div style={styles.leaderboardList}>
            {leaderboard.map((player, index) => (
              <div key={player.name} style={styles.leaderboardItem}>
                <div style={styles.leaderLeft}>
                  <div style={styles.rankCircle}>{index + 1}</div>
                  <div>
                    <div style={styles.leaderName}>{player.name}</div>
                    <div style={styles.leaderMeta}>
                      {player.betsCount} pari(s) • {player.wins} win(s) • {player.losses} loss(es)
                    </div>
                  </div>
                </div>

                <div style={styles.leaderRight}>
                  <div style={styles.leaderMoney}>{formatMoney(player.money)}</div>
                  <div style={styles.leaderMeta}>{player.score} pts</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "profile" && (
        <div style={styles.profileGrid}>
          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h3 style={styles.cardTitle}>Mon profil</h3>
                <p style={styles.cardSub}>Stats, badges et historique.</p>
              </div>
            </div>

            <div style={styles.profileStats}>
              <div style={styles.profileStat}>
                <strong>{formatMoney(currentProfile.money)}</strong>
                <span>Argent</span>
              </div>
              <div style={styles.profileStat}>
                <strong>{currentProfile.score || 0}</strong>
                <span>Score</span>
              </div>
              <div style={styles.profileStat}>
                <strong>{myStats.wins}</strong>
                <span>Victoires</span>
              </div>
              <div style={styles.profileStat}>
                <strong>{myStats.roi}%</strong>
                <span>ROI</span>
              </div>
            </div>

            <h4 style={styles.subTitle}>Badges</h4>
            <div style={styles.badgesWrap}>
              {badges.length > 0 ? (
                badges.map((badge) => (
                  <span
                    key={badge}
                    style={{
                      ...styles.badgeChip,
                      ...badgeStyles[getBadgeColor(badge)],
                    }}
                  >
                    {badge}
                  </span>
                ))
              ) : (
                <div style={styles.emptyBlock}>Pas encore de badge.</div>
              )}
            </div>
          </section>

          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h3 style={styles.cardTitle}>Historique</h3>
                <p style={styles.cardSub}>Tes derniers paris.</p>
              </div>
            </div>

            <div style={styles.historyList}>
              {myHistory.length > 0 ? (
                myHistory.map((entry) => (
                  <div key={entry.wager.id} style={styles.historyItem}>
                    <div>
                      <div style={styles.historyTitle}>{entry.market.title}</div>
                      <div style={styles.historyMeta}>
                        {entry.option.name} • mise {formatMoney(entry.amount)} • x
                        {Number(entry.odds).toFixed(1)}
                      </div>
                    </div>

                    <div
                      style={{
                        ...styles.historyProfit,
                        color: entry.market.resolved
                          ? entry.won
                            ? "#6effb4"
                            : "#ff9e9e"
                          : "#d5defa",
                      }}
                    >
                      {entry.market.resolved
                        ? entry.won
                          ? `+${entry.netProfit}$`
                          : `${entry.netProfit}$`
                        : "En cours"}
                    </div>
                  </div>
                ))
              ) : (
                <div style={styles.emptyBlock}>Aucun pari pour le moment.</div>
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === "proposals" && (
        <div style={styles.profileGrid}>
          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h3 style={styles.cardTitle}>Proposer un pari</h3>
                <p style={styles.cardSub}>Envoie tes idées à l’admin.</p>
              </div>
            </div>

            <form onSubmit={submitProposal} style={styles.formStack}>
              <textarea
                style={styles.textarea}
                placeholder="Ex: Qui sera en retard demain matin ?"
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
          </section>

          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h3 style={styles.cardTitle}>Dernières propositions</h3>
              </div>
            </div>

            <div style={styles.proposalsList}>
              {proposals.length > 0 ? (
                proposals.map((proposal) => (
                  <div key={proposal.id} style={styles.proposalItem}>
                    <div>
                      <div style={styles.proposalTitle}>{proposal.text}</div>
                      <div style={styles.proposalMeta}>
                        par {proposal.username} • {formatDate(proposal.created_at)}
                      </div>
                    </div>

                    {isAdmin ? (
                      <div style={styles.proposalActions}>
                        <button
                          style={styles.smallButton}
                          onClick={() => convertProposalToMarket(proposal)}
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
                    ) : null}
                  </div>
                ))
              ) : (
                <div style={styles.emptyBlock}>Aucune proposition.</div>
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === "admin" && isAdmin && (
        <div style={styles.profileGrid}>
          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h3 style={styles.cardTitle}>Créer un marché</h3>
                <p style={styles.cardSub}>Panel admin premium.</p>
              </div>
              <button style={styles.smallDangerButton} onClick={resetSeason}>
                Reset saison
              </button>
            </div>

            <form onSubmit={createMarket} style={styles.formStack}>
              <input
                style={styles.input}
                placeholder="Titre du marché"
                value={marketForm.title}
                onChange={(e) =>
                  setMarketForm((current) => ({
                    ...current,
                    title: e.target.value,
                  }))
                }
              />

              <div style={styles.adminRow}>
                <input
                  style={styles.input}
                  placeholder="Catégorie"
                  value={marketForm.category}
                  onChange={(e) =>
                    setMarketForm((current) => ({
                      ...current,
                      category: e.target.value,
                    }))
                  }
                />
                <input
                  style={styles.input}
                  type="datetime-local"
                  value={marketForm.closes_at}
                  onChange={(e) =>
                    setMarketForm((current) => ({
                      ...current,
                      closes_at: e.target.value,
                    }))
                  }
                />
              </div>

              {marketForm.options.map((option, index) => (
                <div key={index} style={styles.optionEditorRow}>
                  <input
                    style={styles.input}
                    placeholder={`Option ${index + 1}`}
                    value={option.name}
                    onChange={(e) =>
                      updateMarketOption(index, "name", e.target.value)
                    }
                  />
                  <input
                    style={styles.input}
                    type="number"
                    min="1"
                    step="0.1"
                    placeholder="Cote"
                    value={option.odds}
                    onChange={(e) =>
                      updateMarketOption(index, "odds", e.target.value)
                    }
                  />
                  {marketForm.options.length > 2 ? (
                    <button
                      type="button"
                      style={styles.smallDangerButton}
                      onClick={() => removeMarketOptionField(index)}
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              ))}

              <div style={styles.adminActions}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={addMarketOptionField}
                >
                  + Ajouter une option
                </button>
                <button
                  type="submit"
                  style={styles.primaryButton}
                  disabled={isSubmittingMarket}
                >
                  {isSubmittingMarket ? "Création..." : "Publier le marché"}
                </button>
              </div>
            </form>
          </section>

          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h3 style={styles.cardTitle}>Raccourcis admin</h3>
              </div>
            </div>

            <div style={styles.quickAdminList}>
              <div style={styles.quickAdminItem}>Créer rapidement un Oui / Non</div>
              <div style={styles.quickAdminItem}>Résoudre les marchés ouverts</div>
              <div style={styles.quickAdminItem}>Reset saison en un clic</div>
              <div style={styles.quickAdminItem}>Transformer une proposition en marché</div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

const globalStyles = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Inter, Arial, sans-serif;
    color: #f4f7ff;
    background:
      radial-gradient(circle at top left, rgba(68, 96, 255, 0.16), transparent 28%),
      radial-gradient(circle at bottom right, rgba(0, 255, 174, 0.10), transparent 22%),
      linear-gradient(180deg, #07111f 0%, #040914 100%);
    min-height: 100vh;
  }
  button, input, textarea, select {
    font: inherit;
  }
`;

const badgeStyles = {
  default: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  gold: {
    background: "rgba(255,200,80,0.14)",
    border: "1px solid rgba(255,200,80,0.22)",
  },
  green: {
    background: "rgba(100,255,180,0.14)",
    border: "1px solid rgba(100,255,180,0.22)",
  },
  blue: {
    background: "rgba(100,140,255,0.14)",
    border: "1px solid rgba(100,140,255,0.22)",
  },
  emerald: {
    background: "rgba(0,255,180,0.14)",
    border: "1px solid rgba(0,255,180,0.22)",
  },
};

const styles = {
  page: {
    minHeight: "100vh",
    maxWidth: 1400,
    margin: "0 auto",
    padding: 24,
  },
  authWrap: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
  },
  authCard: {
    width: "min(760px, 100%)",
    background: "rgba(8, 16, 32, 0.90)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 28,
    padding: 32,
    boxShadow: "0 22px 80px rgba(0,0,0,0.35)",
    backdropFilter: "blur(14px)",
  },
  authTag: {
    display: "inline-flex",
    padding: "8px 14px",
    borderRadius: 999,
    border: "1px solid rgba(117,145,255,0.35)",
    background: "rgba(93,120,255,0.14)",
    color: "#d5deff",
    marginBottom: 18,
  },
  authTitle: {
    margin: "0 0 12px",
    fontSize: "clamp(40px, 6vw, 76px)",
    fontWeight: 900,
    letterSpacing: "-0.05em",
    lineHeight: 1,
  },
  heroText: {
    color: "#aeb9d9",
    lineHeight: 1.6,
    fontSize: 18,
    marginBottom: 18,
  },
  heroTextLarge: {
    color: "#b0bbda",
    lineHeight: 1.6,
    fontSize: 18,
    margin: "0 0 18px",
  },
  authSwitch: {
    display: "flex",
    gap: 10,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  authForm: {
    display: "grid",
    gap: 12,
    marginBottom: 18,
  },
  authChipRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  chip: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#d9e2ff",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 18,
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
  },
  logoBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(135deg, #7c95ff 0%, #4c6fff 100%)",
    fontWeight: 900,
  },
  brand: {
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: "-0.03em",
  },
  brandSub: {
    color: "#97a5cd",
    fontSize: 13,
  },
  headerRight: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
  },
  statPill: {
    padding: "10px 14px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  adminPill: {
    padding: "10px 14px",
    borderRadius: 999,
    background: "rgba(255,96,96,0.14)",
    border: "1px solid rgba(255,96,96,0.22)",
    color: "#ffd6d6",
    fontWeight: 700,
  },
  heroPanel: {
    display: "grid",
    gridTemplateColumns: "1.8fr 1fr",
    gap: 18,
    marginBottom: 18,
  },
  heroLeft: {
    padding: 28,
    borderRadius: 28,
    background:
      "linear-gradient(135deg, rgba(14,24,52,0.96) 0%, rgba(8,13,26,0.96) 100%)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  heroRight: {
    padding: 24,
    borderRadius: 28,
    background:
      "linear-gradient(135deg, rgba(11,44,34,0.95) 0%, rgba(9,14,26,0.95) 100%)",
    border: "1px solid rgba(103,255,185,0.16)",
  },
  heroEyebrow: {
    marginBottom: 10,
    fontSize: 13,
    color: "#8ca2ff",
    textTransform: "uppercase",
    letterSpacing: "0.14em",
  },
  heroTitle: {
    margin: "0 0 10px",
    fontSize: "clamp(30px, 4vw, 54px)",
    lineHeight: 1,
    fontWeight: 900,
    letterSpacing: "-0.05em",
  },
  heroStats: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 12,
    marginTop: 18,
  },
  heroStatCard: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 16,
    borderRadius: 18,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  featureLabel: {
    fontSize: 13,
    color: "#8bf0be",
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    marginBottom: 10,
  },
  featureTitle: {
    fontSize: 30,
    fontWeight: 900,
    lineHeight: 1.05,
    marginBottom: 12,
  },
  featureMetaRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 20,
  },
  mutedPill: {
    padding: "8px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#dbe4ff",
    fontSize: 13,
  },
  featureFooter: {
    marginTop: 26,
  },
  topLabel: {
    color: "#9eb0d7",
    display: "block",
    marginBottom: 6,
  },
  topValue: {
    color: "#79ffb7",
  },
  emptyMini: {
    color: "#a4b4db",
  },
  navbar: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 18,
  },
  navButton: {
    borderRadius: 999,
    padding: "12px 16px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "#d8e1ff",
    cursor: "pointer",
  },
  activeNavButton: {
    borderRadius: 999,
    padding: "12px 16px",
    border: "1px solid rgba(95,122,255,0.35)",
    background: "rgba(95,122,255,0.18)",
    color: "#ffffff",
    cursor: "pointer",
  },
  miniTab: {
    borderRadius: 999,
    padding: "10px 14px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "#d8e1ff",
    cursor: "pointer",
  },
  activeMiniTab: {
    borderRadius: 999,
    padding: "10px 14px",
    border: "1px solid rgba(95,122,255,0.35)",
    background: "rgba(95,122,255,0.18)",
    color: "#ffffff",
    cursor: "pointer",
  },
  primaryButton: {
    border: "none",
    borderRadius: 16,
    padding: "14px 18px",
    background: "linear-gradient(135deg, #7d92ff 0%, #4d6fff 100%)",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 14px 28px rgba(77,111,255,0.25)",
  },
  secondaryButton: {
    borderRadius: 16,
    padding: "12px 16px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    color: "#fff",
    cursor: "pointer",
  },
  smallButton: {
    borderRadius: 12,
    padding: "10px 12px",
    border: "1px solid rgba(95,122,255,0.28)",
    background: "rgba(95,122,255,0.16)",
    color: "#eaf0ff",
    cursor: "pointer",
    fontWeight: 700,
  },
  smallDangerButton: {
    borderRadius: 12,
    padding: "10px 12px",
    border: "1px solid rgba(255,96,96,0.24)",
    background: "rgba(255,96,96,0.14)",
    color: "#ffd7d7",
    cursor: "pointer",
    fontWeight: 700,
  },
  pageGrid: {
    display: "grid",
    gridTemplateColumns: "1.7fr 0.8fr",
    gap: 18,
  },
  mainColumn: {
    display: "grid",
    gap: 18,
  },
  sideColumn: {
    display: "grid",
    gap: 18,
  },
  profileGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
  },
  card: {
    padding: 20,
    borderRadius: 24,
    background: "rgba(9, 14, 28, 0.86)",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 14px 40px rgba(0,0,0,0.20)",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 14,
  },
  cardTitle: {
    margin: 0,
    fontSize: 24,
    fontWeight: 800,
    letterSpacing: "-0.03em",
  },
  cardSub: {
    margin: "6px 0 0",
    color: "#9fb0d7",
  },
  filtersBlock: {
    display: "grid",
    gap: 12,
    marginBottom: 16,
  },
  filterTabs: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  filterGrid: {
    display: "grid",
    gridTemplateColumns: "220px 220px 1fr",
    gap: 10,
  },
  input: {
    width: "100%",
    borderRadius: 16,
    padding: "14px 16px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    outline: "none",
  },
  select: {
    width: "100%",
    borderRadius: 16,
    padding: "14px 16px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    outline: "none",
  },
  searchInput: {
    width: "100%",
    borderRadius: 16,
    padding: "14px 16px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    outline: "none",
  },
  textarea: {
    width: "100%",
    minHeight: 120,
    borderRadius: 16,
    padding: "14px 16px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    outline: "none",
    resize: "vertical",
  },
  marketList: {
    display: "grid",
    gap: 14,
  },
  marketCard: {
    padding: 18,
    borderRadius: 22,
    background:
      "linear-gradient(180deg, rgba(10,16,31,0.96) 0%, rgba(6,10,20,0.96) 100%)",
    border: "1px solid rgba(255,255,255,0.07)",
  },
  marketTopRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
    marginBottom: 10,
  },
  marketPills: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  openPill: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(68,227,159,0.14)",
    color: "#9af0c8",
    border: "1px solid rgba(68,227,159,0.22)",
    fontSize: 12,
    fontWeight: 700,
  },
  resolvedPill: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(255,178,76,0.14)",
    color: "#ffd7a8",
    border: "1px solid rgba(255,178,76,0.22)",
    fontSize: 12,
    fontWeight: 700,
  },
  neutralPill: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.05)",
    color: "#d0d8f0",
    border: "1px solid rgba(255,255,255,0.06)",
    fontSize: 12,
  },
  marketEnd: {
    color: "#9dafd8",
    fontSize: 13,
  },
  marketName: {
    margin: "0 0 14px",
    fontSize: 28,
    fontWeight: 900,
    textAlign: "center",
    letterSpacing: "-0.04em",
  },
  closedBox: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    background: "rgba(255,255,255,0.05)",
    color: "#d3dcfb",
  },
  optionsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 12,
    marginTop: 14,
  },
  optionCard: {
    position: "relative",
    borderRadius: 18,
    padding: 16,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "#fff",
    cursor: "pointer",
    textAlign: "left",
  },
  optionCardPicked: {
    border: "1px solid rgba(95,122,255,0.45)",
    background: "rgba(95,122,255,0.14)",
  },
  optionCardWinner: {
    border: "1px solid rgba(68,227,159,0.36)",
    background: "rgba(68,227,159,0.12)",
  },
  optionCardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 18,
  },
  optionLabel: {
    fontSize: 18,
    fontWeight: 800,
  },
  optionPrice: {
    color: "#7dffbc",
    fontWeight: 900,
    fontSize: 18,
  },
  optionCardBottom: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    color: "#a5b4d8",
    fontSize: 13,
  },
  smallBadgeBlue: {
    position: "absolute",
    top: 10,
    right: 10,
    padding: "6px 8px",
    borderRadius: 999,
    background: "rgba(95,122,255,0.20)",
    fontSize: 11,
  },
  smallBadgeGreen: {
    position: "absolute",
    top: 10,
    right: 10,
    padding: "6px 8px",
    borderRadius: 999,
    background: "rgba(68,227,159,0.20)",
    fontSize: 11,
  },
  resolveRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: 14,
  },
  resolveText: {
    color: "#9fb0d7",
  },
  commentSection: {
    marginTop: 18,
    paddingTop: 14,
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },
  commentHeader: {
    fontWeight: 800,
    marginBottom: 10,
    textAlign: "center",
    fontSize: 18,
  },
  commentInputRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
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
    color: "#dce5ff",
  },
  quickStats: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 10,
  },
  quickStat: {
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  topMiniList: {
    display: "grid",
    gap: 10,
  },
  topMiniItem: {
    padding: 12,
    borderRadius: 14,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
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
    padding: 16,
    borderRadius: 18,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  leaderLeft: {
    display: "flex",
    gap: 12,
    alignItems: "center",
  },
  rankCircle: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.08)",
    fontWeight: 900,
  },
  leaderName: {
    fontWeight: 800,
  },
  leaderMeta: {
    color: "#9fb0d7",
    fontSize: 12,
  },
  leaderRight: {
    textAlign: "right",
  },
  leaderMoney: {
    color: "#78ffb7",
    fontWeight: 900,
  },
  profileStats: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 10,
    marginBottom: 18,
  },
  profileStat: {
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  subTitle: {
    margin: "0 0 10px",
  },
  badgesWrap: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  badgeChip: {
    padding: "8px 12px",
    borderRadius: 999,
    color: "#eef3ff",
  },
  historyList: {
    display: "grid",
    gap: 10,
  },
  historyItem: {
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  historyTitle: {
    fontWeight: 800,
  },
  historyMeta: {
    color: "#9fb0d7",
    fontSize: 12,
  },
  historyProfit: {
    fontWeight: 900,
  },
  formStack: {
    display: "grid",
    gap: 12,
  },
  proposalsList: {
    display: "grid",
    gap: 10,
  },
  proposalItem: {
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "start",
  },
  proposalTitle: {
    fontWeight: 800,
    marginBottom: 4,
  },
  proposalMeta: {
    color: "#9fb0d7",
    fontSize: 12,
  },
  proposalActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  adminRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  optionEditorRow: {
    display: "grid",
    gridTemplateColumns: "1fr 140px auto",
    gap: 10,
    alignItems: "center",
  },
  adminActions: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },
  quickAdminList: {
    display: "grid",
    gap: 10,
  },
  quickAdminItem: {
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  emptyBlock: {
    padding: 18,
    borderRadius: 18,
    background: "rgba(255,255,255,0.04)",
    border: "1px dashed rgba(255,255,255,0.10)",
    color: "#a5b4d9",
    textAlign: "center",
  },
  loadingCard: {
    padding: 16,
    borderRadius: 16,
    background: "rgba(255,255,255,0.04)",
  },
  errorBanner: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,89,89,0.14)",
    border: "1px solid rgba(255,89,89,0.24)",
    color: "#ffd7d7",
  },
  successBanner: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 16,
    background: "rgba(68,227,159,0.14)",
    border: "1px solid rgba(68,227,159,0.24)",
    color: "#d2ffe7",
  },
};
