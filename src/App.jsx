import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://YOUR_PROJECT.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || "YOUR_PUBLISHABLE_KEY";

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
    !SUPABASE_URL.includes("YOUR_PROJECT") &&
    !SUPABASE_ANON_KEY.includes("YOUR_PUBLISHABLE_KEY");

  const normalizedUser = sessionUser?.trim();
  const isAdmin =
    unlockAdmin || AUTO_ADMIN_USERS.includes(normalizedUser || "");

  useEffect(() => {
    if (!isConfigured || !sessionUser) return;
    loadAll();

    const channel = supabase
      .channel("bet-potes-live")
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

    if (firstError) {
      setErrorMessage(firstError.message);
    }

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

  const myHistory = useMemo(() => {
    const optionMap = new Map(options.map((o) => [o.id, o]));
    const marketMap = new Map(markets.map((m) => [m.id, m]));

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
          grossReturn,
          netProfit,
        };
      })
      .filter((item) => item.market && item.option)
      .sort((a, b) => b.wager.id - a.wager.id);
  }, [wagers, options, markets, sessionUser]);

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

  const badges = useMemo(() => {
    const result = [];

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
  }, [currentProfile, myStats, myHistory]);

  const leaderboard = useMemo(() => {
    const names = new Set(scores.map((s) => s.username));
    wagers.forEach((w) => names.add(w.username));
    if (sessionUser) names.add(sessionUser);

    return [...names]
      .map((name) => {
        const profile = scoreMap.get(name) || {
          username: name,
          score: 0,
          money: STARTING_MONEY,
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
  }, [scores, wagers, scoreMap, sessionUser]);

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

    if (marketSort === "newest") {
      data.sort((a, b) => b.id - a.id);
    } else if (marketSort === "oldest") {
      data.sort((a, b) => a.id - b.id);
    } else if (marketSort === "volume") {
      data.sort((a, b) => getMarketVolume(b.id) - getMarketVolume(a.id));
    }

    return data;
  }, [markets, marketStatusFilter, marketCategoryFilter, marketSearch, marketSort, wagers, options]);

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
      created_at: new Date().toISOString(),
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
      const optionVolume = optionWagers.reduce(
        (acc, wager) => acc + Number(wager.amount || 0),
        0
      );
      return sum + optionVolume;
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

    const localScoreMap = new Map(
      scores.map((score) => [score.username, { ...score }])
    );

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

  if (!isConfigured) {
    return (
      <div style={styles.page}>
        <style>{globalStyles}</style>
        <div style={styles.authWrap}>
          <div style={styles.authCard}>
            <h1 style={styles.heroTitle}>⚙️ Configuration requise</h1>
            <p style={styles.heroText}>
              Ajoute <strong>VITE_SUPABASE_URL</strong> et{" "}
              <strong>VITE_SUPABASE_ANON_KEY</strong> dans Vercel et en local.
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
            <div style={styles.badge}>Version finale</div>
            <h1 style={styles.authTitle}>Bet entre potes</h1>
            <p style={styles.heroText}>
              Marchés privés entre potes, bankroll fictive, commentaires,
              badges, historique, leaderboard et admin.
            </p>

            <div style={styles.authTabs}>
              <button
                style={authMode === "login" ? styles.activeSmallTab : styles.smallTab}
                onClick={() => setAuthMode("login")}
              >
                Connexion
              </button>
              <button
                style={authMode === "register" ? styles.activeSmallTab : styles.smallTab}
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

              {errorMessage ? <div style={styles.errorBox}>{errorMessage}</div> : null}
              {successMessage ? (
                <div style={styles.successBox}>{successMessage}</div>
              ) : null}

              {authMode === "login" ? (
                <button style={styles.primaryButton} onClick={login}>
                  Connexion
                </button>
              ) : (
                <button style={styles.primaryButton} onClick={register}>
                  Créer le compte
                </button>
              )}
            </div>

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

  const topPlayer = leaderboard[0];

  return (
    <div style={styles.page}>
      <style>{globalStyles}</style>

      <div style={styles.topbar}>
        <div style={styles.logoGroup}>
          <div style={styles.logoSquare}>◆</div>
          <div>
            <div style={styles.brandTitle}>Bet entre potes</div>
            <div style={styles.brandSub}>private market • final edition</div>
          </div>
        </div>

        <div style={styles.topbarRight}>
          <div style={styles.userPill}>👤 {sessionUser}</div>
          <div style={styles.userPill}>💸 {formatMoney(currentProfile.money)}</div>
          <div style={styles.userPill}>🏆 {Number(currentProfile.score || 0)} pts</div>

          {!isAdmin ? (
            <button style={styles.ghostButton} onClick={tryUnlockAdmin}>
              Débloquer admin
            </button>
          ) : (
            <div style={styles.adminPill}>ADMIN</div>
          )}

          <button style={styles.ghostButton} onClick={logout}>
            Déconnexion
          </button>
        </div>
      </div>

      <div style={styles.heroGrid}>
        <div style={styles.heroCardLarge}>
          <div style={styles.heroSmall}>Marché du moment</div>
          <h2 style={styles.heroHeadline}>
            Parie, propose, grimpe au classement.
          </h2>
          <p style={styles.heroText}>
            Version finale avec onglets, auth, bankroll, ROI, historique, badges,
            commentaires, propositions et panel admin.
          </p>

          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <strong>{marketStats.openCount}</strong>
              <span>Marchés ouverts</span>
            </div>
            <div style={styles.statCard}>
              <strong>{marketStats.activeUsers}</strong>
              <span>Joueurs actifs</span>
            </div>
            <div style={styles.statCard}>
              <strong>{formatMoney(marketStats.totalVolume)}</strong>
              <span>Volume total</span>
            </div>
          </div>
        </div>

        <div style={styles.heroCardSide}>
          <div style={styles.heroSmall}>Top joueur</div>
          <div style={styles.topPlayerName}>
            {topPlayer ? topPlayer.name : "Personne"}
          </div>
          <div style={styles.topPlayerMoney}>
            {topPlayer ? formatMoney(topPlayer.money) : "1000$"}
          </div>
          <div style={styles.subtleText}>
            Le leaderboard principal est basé sur l’argent fictif.
          </div>
        </div>
      </div>

      <div style={styles.tabBar}>
        {TABS.filter((tab) => (tab.key === "admin" ? isAdmin : true)).map((tab) => (
          <button
            key={tab.key}
            style={activeTab === tab.key ? styles.activeTabButton : styles.tabButton}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {errorMessage ? <div style={styles.errorBox}>{errorMessage}</div> : null}
      {successMessage ? <div style={styles.successBox}>{successMessage}</div> : null}

      {activeTab === "markets" && (
        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <div>
              <h3 style={styles.sectionTitle}>Marchés</h3>
              <p style={styles.sectionSubtitle}>
                Choisis une position, mets un montant, et fais grossir ta bankroll.
              </p>
            </div>
          </div>

          <div style={styles.filters}>
            <div style={styles.filterRow}>
              <button
                style={
                  marketStatusFilter === "open"
                    ? styles.activeSmallTab
                    : styles.smallTab
                }
                onClick={() => setMarketStatusFilter("open")}
              >
                Ouverts
              </button>
              <button
                style={
                  marketStatusFilter === "resolved"
                    ? styles.activeSmallTab
                    : styles.smallTab
                }
                onClick={() => setMarketStatusFilter("resolved")}
              >
                Résolus
              </button>
              <button
                style={
                  marketStatusFilter === "all"
                    ? styles.activeSmallTab
                    : styles.smallTab
                }
                onClick={() => setMarketStatusFilter("all")}
              >
                Tous
              </button>
            </div>

            <div style={styles.filterInputs}>
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
                  <div style={styles.marketHeader}>
                    <div style={styles.marketMeta}>
                      <span style={market.resolved ? styles.pillResolved : styles.pillOpen}>
                        {market.resolved ? "Résolu" : closed ? "Fermé" : "Ouvert"}
                      </span>
                      <span style={styles.pillNeutral}>
                        {(market.category || "Fun").toUpperCase()}
                      </span>
                      <span style={styles.pillNeutral}>
                        Volume {formatMoney(totalVolume)}
                      </span>
                    </div>

                    <div style={styles.marketDates}>
                      <span>Fin : {formatDate(market.closes_at)}</span>
                    </div>
                  </div>

                  <h4 style={styles.marketTitle}>{market.title}</h4>

                  {!closed && !market.resolved ? (
                    <div style={styles.amountRow}>
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
                    </div>
                  ) : (
                    <div style={styles.closedNotice}>
                      {market.resolved
                        ? "Marché résolu"
                        : "Marché fermé, plus aucune mise possible"}
                    </div>
                  )}

                  {marketOptions.length === 0 ? (
                    <div style={styles.emptyState}>
                      Ce marché n’a pas encore d’options.
                    </div>
                  ) : (
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
                            <div style={styles.optionTop}>
                              <span style={styles.optionName}>{option.name}</span>
                              <span style={styles.optionOdds}>
                                x{Number(option.odds || 1).toFixed(1)}
                              </span>
                            </div>

                            <div style={styles.optionBottom}>
                              <span>{share}% du volume</span>
                              <span>{formatMoney(optionVolume)}</span>
                            </div>

                            {pickedByMe && !market.resolved ? (
                              <span style={styles.pickBadge}>Ton pick</span>
                            ) : null}

                            {isWinner ? (
                              <span style={styles.winnerBadge}>Gagnant</span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {isAdmin && !market.resolved && (optionsByMarket[market.id] || []).length > 0 && (
                    <div style={styles.adminResolveRow}>
                      <span style={styles.resolveLabel}>Résoudre :</span>
                      {(optionsByMarket[market.id] || []).map((option) => (
                        <button
                          key={option.id}
                          style={styles.smallActionButton}
                          onClick={() => resolveMarket(market, option)}
                        >
                          {option.name}
                        </button>
                      ))}
                    </div>
                  )}

                  <div style={styles.commentBlock}>
                    <div style={styles.commentTitle}>Commentaires</div>
                    <div style={styles.commentInputRow}>
                      <input
                        style={styles.input}
                        placeholder="Lâche ton avis..."
                        value={commentDrafts[market.id] || ""}
                        onChange={(e) =>
                          setCommentDrafts((current) => ({
                            ...current,
                            [market.id]: e.target.value,
                          }))
                        }
                      />
                      <button
                        style={styles.smallActionButton}
                        onClick={() => addComment(market.id)}
                      >
                        Envoyer
                      </button>
                    </div>

                    <div style={styles.commentList}>
                      {(commentsByMarket[market.id] || []).slice(0, 5).map((comment) => (
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
              <div style={styles.emptyState}>Aucun marché ici pour le moment.</div>
            ) : null}
          </div>
        </section>
      )}

      {activeTab === "leaderboard" && (
        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <div>
              <h3 style={styles.sectionTitle}>Leaderboard</h3>
              <p style={styles.sectionSubtitle}>Classement principal par bankroll.</p>
            </div>
          </div>

          <div style={styles.leaderboardList}>
            {leaderboard.map((player, index) => (
              <div key={player.name} style={styles.leaderboardItem}>
                <div style={styles.leaderLeft}>
                  <div style={styles.rankBubble}>{index + 1}</div>
                  <div>
                    <div style={styles.leaderName}>{player.name}</div>
                    <div style={styles.leaderSub}>
                      {player.betsCount} pari(s) • {player.wins} win(s)
                    </div>
                  </div>
                </div>

                <div style={styles.leaderRight}>
                  <div style={styles.leaderMoney}>{formatMoney(player.money)}</div>
                  <div style={styles.leaderSub}>{player.score} pts</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "profile" && (
        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <div>
              <h3 style={styles.sectionTitle}>Mon profil</h3>
              <p style={styles.sectionSubtitle}>
                Argent, ROI, badges et historique détaillé.
              </p>
            </div>
          </div>

          <div style={styles.profileTopGrid}>
            <div style={styles.profileStatCard}>
              <strong>{formatMoney(currentProfile.money)}</strong>
              <span>Argent</span>
            </div>
            <div style={styles.profileStatCard}>
              <strong>{currentProfile.score || 0}</strong>
              <span>Score</span>
            </div>
            <div style={styles.profileStatCard}>
              <strong>{myStats.roi}%</strong>
              <span>ROI</span>
            </div>
            <div style={styles.profileStatCard}>
              <strong>{myStats.wins}</strong>
              <span>Victoires</span>
            </div>
          </div>

          <div style={styles.sectionCard}>
            <h4 style={styles.cardTitle}>Badges</h4>
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
          </div>

          <div style={styles.sectionCard}>
            <h4 style={styles.cardTitle}>Historique</h4>
            <div style={styles.historyList}>
              {myHistory.length > 0 ? (
                myHistory.map((entry) => (
                  <div key={entry.wager.id} style={styles.historyItem}>
                    <div>
                      <div style={styles.historyTitle}>{entry.market.title}</div>
                      <div style={styles.historySub}>
                        {entry.option.name} • mise {formatMoney(entry.amount)} • x
                        {Number(entry.odds).toFixed(1)}
                      </div>
                    </div>
                    <div
                      style={{
                        ...styles.historyProfit,
                        color: entry.market.resolved
                          ? entry.won
                            ? "#7dffbb"
                            : "#ff9d9d"
                          : "#cfd7f6",
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
                <div style={styles.emptyState}>Aucun pari pour l’instant.</div>
              )}
            </div>
          </div>
        </section>
      )}

      {activeTab === "proposals" && (
        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <div>
              <h3 style={styles.sectionTitle}>Proposer un pari</h3>
              <p style={styles.sectionSubtitle}>
                Envoie tes idées, l’admin peut les transformer en marché.
              </p>
            </div>
          </div>

          <div style={styles.sectionCard}>
            <form onSubmit={submitProposal} style={styles.proposalForm}>
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
          </div>

          <div style={styles.proposalsList}>
            {proposals.map((proposal) => (
              <div key={proposal.id} style={styles.proposalCard}>
                <div>
                  <div style={styles.proposalText}>{proposal.text}</div>
                  <div style={styles.proposalMeta}>
                    par {proposal.username} • {formatDate(proposal.created_at)}
                  </div>
                </div>

                {isAdmin ? (
                  <div style={styles.proposalActions}>
                    <button
                      style={styles.smallActionButton}
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
            ))}

            {proposals.length === 0 ? (
              <div style={styles.emptyState}>Aucune proposition pour l’instant.</div>
            ) : null}
          </div>
        </section>
      )}

      {activeTab === "admin" && isAdmin && (
        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <div>
              <h3 style={styles.sectionTitle}>Admin</h3>
              <p style={styles.sectionSubtitle}>
                Créer, fermer, résoudre, reset saison.
              </p>
            </div>

            <button style={styles.smallDangerButton} onClick={resetSeason}>
              Reset saison
            </button>
          </div>

          <div style={styles.sectionCard}>
            <h4 style={styles.cardTitle}>Créer un marché</h4>

            <form onSubmit={createMarket} style={styles.adminForm}>
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

              <div style={styles.adminGrid}>
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
                <div key={index} style={styles.optionEditRow}>
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
                    step="0.1"
                    min="1"
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
                  style={styles.ghostButton}
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
          </div>
        </section>
      )}
    </div>
  );
}

const globalStyles = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Inter, Arial, sans-serif;
    color: #f3f6ff;
    background:
      radial-gradient(circle at top left, rgba(57, 93, 255, 0.20), transparent 30%),
      radial-gradient(circle at bottom right, rgba(0, 255, 163, 0.12), transparent 25%),
      linear-gradient(180deg, #07111f 0%, #050a14 100%);
    min-height: 100vh;
  }
  button, input, textarea, select {
    font: inherit;
  }
`;

const styles = {
  page: {
    minHeight: "100vh",
    padding: "24px",
    maxWidth: 1400,
    margin: "0 auto",
  },
  authWrap: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
  },
  authCard: {
    width: "min(760px, 100%)",
    background: "rgba(8, 16, 32, 0.88)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 28,
    padding: 32,
    boxShadow: "0 20px 80px rgba(0,0,0,0.35)",
    backdropFilter: "blur(14px)",
  },
  badge: {
    display: "inline-flex",
    padding: "8px 14px",
    borderRadius: 999,
    border: "1px solid rgba(117, 145, 255, 0.35)",
    background: "rgba(93, 120, 255, 0.14)",
    color: "#cfd8ff",
    marginBottom: 18,
  },
  authTitle: {
    margin: "0 0 12px",
    fontSize: "clamp(38px, 6vw, 74px)",
    lineHeight: 1,
    fontWeight: 900,
    letterSpacing: "-0.05em",
  },
  heroTitle: {
    margin: "0 0 16px",
    fontSize: "clamp(34px, 6vw, 56px)",
    lineHeight: 1,
    fontWeight: 900,
  },
  heroText: {
    color: "#aab6d8",
    fontSize: 18,
    lineHeight: 1.6,
    marginBottom: 18,
  },
  authTabs: {
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
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 22,
  },
  logoGroup: {
    display: "flex",
    alignItems: "center",
    gap: 14,
  },
  logoSquare: {
    width: 42,
    height: 42,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(135deg, #7d95ff 0%, #4b6fff 100%)",
    fontWeight: 900,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: "-0.03em",
  },
  brandSub: {
    color: "#96a4cc",
    fontSize: 13,
  },
  topbarRight: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },
  userPill: {
    padding: "10px 14px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  adminPill: {
    padding: "10px 14px",
    borderRadius: 999,
    background: "rgba(255, 93, 93, 0.16)",
    border: "1px solid rgba(255, 93, 93, 0.25)",
    color: "#ffc0c0",
    fontWeight: 700,
  },
  heroGrid: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
    gap: 18,
    marginBottom: 18,
  },
  heroCardLarge: {
    padding: 28,
    borderRadius: 28,
    background:
      "linear-gradient(135deg, rgba(15,25,54,0.95) 0%, rgba(9,14,28,0.95) 100%)",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 16px 40px rgba(0,0,0,0.25)",
  },
  heroCardSide: {
    padding: 24,
    borderRadius: 28,
    background:
      "linear-gradient(135deg, rgba(12,48,36,0.92) 0%, rgba(8,15,28,0.95) 100%)",
    border: "1px solid rgba(74, 255, 176, 0.18)",
  },
  heroSmall: {
    marginBottom: 10,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    color: "#8aa1ff",
  },
  heroHeadline: {
    margin: "0 0 10px",
    fontSize: "clamp(28px, 4vw, 56px)",
    lineHeight: 1,
    fontWeight: 900,
    letterSpacing: "-0.05em",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 12,
    marginTop: 20,
  },
  statCard: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 16,
    borderRadius: 18,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  topPlayerName: {
    fontSize: 30,
    fontWeight: 800,
    marginBottom: 6,
  },
  topPlayerMoney: {
    color: "#6effb2",
    fontSize: 22,
    fontWeight: 800,
    marginBottom: 8,
  },
  subtleText: {
    color: "#9fb0d5",
    lineHeight: 1.6,
  },
  tabBar: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 18,
  },
  tabButton: {
    borderRadius: 999,
    padding: "12px 16px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "#cdd6f3",
    cursor: "pointer",
  },
  activeTabButton: {
    borderRadius: 999,
    padding: "12px 16px",
    border: "1px solid rgba(97, 123, 255, 0.35)",
    background: "rgba(97,123,255,0.18)",
    color: "#ffffff",
    cursor: "pointer",
  },
  smallTab: {
    borderRadius: 999,
    padding: "10px 14px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "#cdd6f3",
    cursor: "pointer",
  },
  activeSmallTab: {
    borderRadius: 999,
    padding: "10px 14px",
    border: "1px solid rgba(97, 123, 255, 0.35)",
    background: "rgba(97,123,255,0.18)",
    color: "#ffffff",
    cursor: "pointer",
  },
  section: {
    display: "grid",
    gap: 16,
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: "-0.04em",
  },
  sectionSubtitle: {
    margin: "6px 0 0",
    color: "#9fb0d5",
  },
  filters: {
    display: "grid",
    gap: 12,
    background: "rgba(9, 14, 28, 0.8)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 22,
    padding: 18,
  },
  filterRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  filterInputs: {
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
    color: "#ffffff",
    outline: "none",
  },
  textarea: {
    width: "100%",
    minHeight: 120,
    borderRadius: 16,
    padding: "14px 16px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "#ffffff",
    outline: "none",
    resize: "vertical",
  },
  select: {
    width: "100%",
    borderRadius: 16,
    padding: "14px 16px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "#ffffff",
    outline: "none",
  },
  searchInput: {
    width: "100%",
    borderRadius: 16,
    padding: "14px 16px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "#ffffff",
    outline: "none",
  },
  primaryButton: {
    border: "none",
    borderRadius: 16,
    padding: "14px 18px",
    background: "linear-gradient(135deg, #7f94ff 0%, #4d6eff 100%)",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 14px 28px rgba(77,110,255,0.25)",
  },
  ghostButton: {
    borderRadius: 16,
    padding: "12px 16px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    color: "#fff",
    cursor: "pointer",
  },
  smallActionButton: {
    borderRadius: 12,
    padding: "10px 12px",
    border: "1px solid rgba(89, 116, 255, 0.24)",
    background: "rgba(89,116,255,0.14)",
    color: "#e7ebff",
    cursor: "pointer",
    fontWeight: 700,
  },
  smallDangerButton: {
    borderRadius: 12,
    padding: "10px 12px",
    border: "1px solid rgba(255, 96, 96, 0.24)",
    background: "rgba(255,96,96,0.14)",
    color: "#ffd6d6",
    cursor: "pointer",
    fontWeight: 700,
  },
  marketList: {
    display: "grid",
    gap: 14,
  },
  marketCard: {
    padding: 18,
    borderRadius: 24,
    background:
      "linear-gradient(180deg, rgba(10,16,31,0.95) 0%, rgba(6,10,20,0.95) 100%)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  marketHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "start",
    marginBottom: 12,
    flexWrap: "wrap",
  },
  marketMeta: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  marketDates: {
    color: "#98abd3",
    fontSize: 13,
  },
  pillOpen: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(54, 221, 143, 0.15)",
    color: "#9af0c6",
    border: "1px solid rgba(54,221,143,0.22)",
    fontWeight: 700,
    fontSize: 12,
  },
  pillResolved: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(255, 175, 76, 0.15)",
    color: "#ffd8a6",
    border: "1px solid rgba(255,175,76,0.22)",
    fontWeight: 700,
    fontSize: 12,
  },
  pillNeutral: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.05)",
    color: "#c9d2ef",
    border: "1px solid rgba(255,255,255,0.06)",
    fontSize: 12,
  },
  marketTitle: {
    margin: "0 0 14px",
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: "-0.04em",
  },
  amountRow: {
    marginBottom: 12,
  },
  closedNotice: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    background: "rgba(255,255,255,0.05)",
    color: "#cbd5f5",
  },
  optionsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
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
    border: "1px solid rgba(88,116,255,0.45)",
    background: "rgba(88,116,255,0.14)",
  },
  optionCardWinner: {
    border: "1px solid rgba(54,221,143,0.35)",
    background: "rgba(54,221,143,0.12)",
  },
  optionTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 16,
  },
  optionName: {
    fontSize: 18,
    fontWeight: 800,
  },
  optionOdds: {
    color: "#84f0be",
    fontWeight: 900,
  },
  optionBottom: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    color: "#a6b5db",
    fontSize: 13,
  },
  pickBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    padding: "6px 8px",
    borderRadius: 999,
    background: "rgba(88,116,255,0.20)",
    fontSize: 11,
  },
  winnerBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    padding: "6px 8px",
    borderRadius: 999,
    background: "rgba(54,221,143,0.20)",
    fontSize: 11,
  },
  adminResolveRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 14,
  },
  resolveLabel: {
    color: "#9db0d8",
  },
  commentBlock: {
    marginTop: 16,
    paddingTop: 14,
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },
  commentTitle: {
    fontWeight: 800,
    marginBottom: 10,
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
    color: "#dce3fb",
  },
  leaderboardList: {
    display: "grid",
    gap: 10,
  },
  leaderboardItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 18,
    background: "rgba(9,14,28,0.82)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  leaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  rankBubble: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.08)",
    fontWeight: 800,
  },
  leaderName: {
    fontWeight: 800,
  },
  leaderSub: {
    color: "#9eb0d6",
    fontSize: 12,
  },
  leaderRight: {
    textAlign: "right",
  },
  leaderMoney: {
    color: "#7effb8",
    fontWeight: 900,
  },
  profileTopGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 12,
  },
  profileStatCard: {
    padding: 16,
    borderRadius: 18,
    background: "rgba(9,14,28,0.82)",
    border: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  sectionCard: {
    padding: 20,
    borderRadius: 22,
    background: "rgba(9,14,28,0.82)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  cardTitle: {
    margin: "0 0 12px",
    fontSize: 20,
  },
  badgesWrap: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
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
  historySub: {
    color: "#9eb0d6",
    fontSize: 12,
  },
  historyProfit: {
    fontWeight: 900,
  },
  proposalForm: {
    display: "grid",
    gap: 12,
  },
  proposalsList: {
    display: "grid",
    gap: 10,
  },
  proposalCard: {
    padding: 16,
    borderRadius: 18,
    background: "rgba(9,14,28,0.82)",
    border: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "start",
  },
  proposalText: {
    fontWeight: 800,
    marginBottom: 4,
  },
  proposalMeta: {
    color: "#9eb0d6",
    fontSize: 12,
  },
  proposalActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  adminForm: {
    display: "grid",
    gap: 12,
  },
  adminGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  optionEditRow: {
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
  loginFeatures: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  chip: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#dce4ff",
  },
  loadingCard: {
    padding: 16,
    borderRadius: 18,
    background: "rgba(255,255,255,0.05)",
  },
  errorBox: {
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,89,89,0.14)",
    border: "1px solid rgba(255,89,89,0.24)",
    color: "#ffd6d6",
  },
  successBox: {
    padding: 14,
    borderRadius: 16,
    background: "rgba(70,225,152,0.14)",
    border: "1px solid rgba(70,225,152,0.22)",
    color: "#c7ffe1",
  },
  emptyState: {
    padding: 18,
    borderRadius: 18,
    background: "rgba(255,255,255,0.04)",
    border: "1px dashed rgba(255,255,255,0.10)",
    color: "#a4b2d7",
    textAlign: "center",
  },
};
