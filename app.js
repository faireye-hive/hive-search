
    // Configurações
    const API_BASE = "https://api.hive.blog/hivesense-api/posts/search";
    const API_POSTS_BY_IDS = "https://api.hive.blog/hivesense-api/posts/by-ids";
    const API_SIMILAR_POSTS = "https://api.hive.blog/hivesense-api/posts";
    const API_USER_PERMLINKS = "https://api.hive.blog/hafbe-api/accounts";
    const POSTS_PER_PAGE = 10;
    const MAX_RESULTS = 1000;
    const BATCH_SIZE = 50;

    // Estado global
    let currentSearch = {
      query: "",
      truncate: 200,
      sortOrder: "relevance",
      allPosts: [], // Todos os posts carregados
      filteredPosts: [], // Posts após aplicar filtros
      currentPage: 1,
      totalResults: 0,
      isFetchingComplete: false,
      originalSearchResults: [],
      filters: {
        authors: [], // Autores com @ (mostrar APENAS esses)
        includeTerms: [], // Termos com + (DEVE ter)
        excludeTerms: [], // Termos com - (NÃO PODE ter)
      },
      cleanQuery: "", // Query sem filtros
      searchMode: "normal", // 'normal', 'similar' ou 'user'
      originalPost: null, // Informações do post original (para busca por link)
      similarPostsStubs: [], // Stubs dos posts similares (para ordenação)
      userInfo: null, // Informações do usuário (para busca por @username)
      localFilter: "", // Filtro local atual
      advancedFilters: {
        dateStart: null,
        dateEnd: null,
        category: "",
        minVotes: 0
      }
    };

    // Elementos DOM
    const elements = {
      searchForm: document.getElementById("searchForm"),
      searchInput: document.getElementById("q"),
      truncateSelect: document.getElementById("truncate"),
      resultsEl: document.getElementById("results"),
      metaEl: document.getElementById("meta"),
      paginationEl: document.getElementById("pagination"),
      prevBtn: document.getElementById("prevPage"),
      nextBtn: document.getElementById("nextPage"),
      pageInfo: document.getElementById("pageInfo"),
      pageNumbers: document.getElementById("pageNumbers"),
      btnSpinner: document.getElementById("btnSpinner"),
      btnText: document.getElementById("btnText"),
      sortRelevance: document.getElementById("sortRelevance"),
      sortRecent: document.getElementById("sortRecent"),
      progressContainer: document.getElementById("progressContainer"),
      progressFill: document.getElementById("progressFill"),
      progressText: document.getElementById("progressText"),
      activeFilters: document.getElementById("activeFilters"),
      filterBadges: document.getElementById("filterBadges"),
      clearFilters: document.getElementById("clearFilters"),
      originalPostInfo: document.getElementById("originalPostInfo"),
      originalPostDetails: document.getElementById("originalPostDetails"),
      closeOriginalPostInfo: document.getElementById("closeOriginalPostInfo"),
      userInfo: document.getElementById("userInfo"),
      userDetails: document.getElementById("userDetails"),
      closeUserInfo: document.getElementById("closeUserInfo"),
      localFilterContainer: document.getElementById("localFilterContainer"),
      localFilter: document.getElementById("localFilter"),
      clearLocalFilter: document.getElementById("clearLocalFilter"),
      localFilterStats: document.getElementById("localFilterStats"),
      filteredCount: document.getElementById("filteredCount"),
      totalCount: document.getElementById("totalCount"),
      advancedFilterToggle: document.getElementById("advancedFilterToggle"),
      advancedFilters: document.getElementById("advancedFilters"),
      filterDateStart: document.getElementById("filterDateStart"),
      filterDateEnd: document.getElementById("filterDateEnd"),
      filterCategory: document.getElementById("filterCategory"),
      filterMinVotes: document.getElementById("filterMinVotes"),
      applyAdvancedFilters: document.getElementById("applyAdvancedFilters"),
      resetAdvancedFilters: document.getElementById("resetAdvancedFilters"),
    };

    /**
     * Verifica se a string é uma URL válida do Hive
     */
    function isHiveURL(input) {
      // Padrões de URLs do Hive
      const hivePatterns = [
        /^https?:\/\/(?:www\.)?hive\.blog\/(?:[\w-]+\/)?@([\w-]+)\/([\w-]+)/i,
        /^https?:\/\/(?:www\.)?ecency\.com\/@([\w-]+)\/([\w-]+)/i,
        /^https?:\/\/(?:www\.)?peakd\.com\/(?:[\w-]+\/)?@([\w-]+)\/([\w-]+)/i,
        /^https?:\/\/(?:www\.)?leofinance\.io\/@([\w-]+)\/([\w-]+)/i,
        /^https?:\/\/(?:www\.)?splintertalk\.io\/@([\w-]+)\/([\w-]+)/i,
        /^https?:\/\/(?:www\.)?proofofbrain\.io\/@([\w-]+)\/([\w-]+)/i,
        /^https?:\/\/(?:www\.)?liketu\.io\/@([\w-]+)\/([\w-]+)/i,
        /^https?:\/\/(?:www\.)?naturalmedicine\.io\/@([\w-]+)\/([\w-]+)/i,
      ];

      for (const pattern of hivePatterns) {
        const match = input.match(pattern);
        if (match) {
          return {
            isHiveURL: true,
            author: match[1],
            permlink: match[2],
            url: input,
          };
        }
      }

      return { isHiveURL: false };
    }

    /**
     * Verifica se a query é apenas um nome de usuário (começa com @ e não tem outros termos)
     */
    function isUserSearch(query) {
      // Remove espaços em branco
      const trimmedQuery = query.trim();
      
      // Verifica se começa com @ e não contém outros caracteres além do nome de usuário
      const userMatch = trimmedQuery.match(/^@([a-zA-Z0-9.\-_]+)$/);
      
      if (userMatch) {
        return {
          isUserSearch: true,
          username: userMatch[1]
        };
      }
      
      return { isUserSearch: false };
    }

    /**
     * Busca todos os permlinks de um usuário usando a API HAFBE
     */
    async function fetchUserPermlinks(username, page = 1, pageSize = 100) {
      try {
        const url = `${API_USER_PERMLINKS}/${username}/comment-permlinks?comment-type=post&page=${page}&page-size=${pageSize}`;
        
        elements.metaEl.textContent = `Buscando posts do usuário @${username} (página ${page})...`;

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        console.error("Erro ao buscar permlinks do usuário:", error);
        throw error;
      }
    }

    /**
     * Busca TODOS os posts de um usuário paginando através de todas as páginas
     */
    async function fetchAllUserPosts(username) {
      try {
        let allPermlinks = [];
        let currentPage = 1;
        let totalPages = 1;
        let totalPosts = 0;

        // Primeira requisição para obter informações totais
        const firstPageData = await fetchUserPermlinks(username, 1, 100);
        
        if (!firstPageData.permlinks_result || firstPageData.permlinks_result.length === 0) {
          return {
            stubs: [],
            totalPosts: 0,
            totalPages: 0
          };
        }

        totalPosts = firstPageData.total_permlinks || firstPageData.permlinks_result.length;
        totalPages = firstPageData.total_pages || 1;
        
        // Adiciona permlinks da primeira página
        firstPageData.permlinks_result.forEach(item => {
          allPermlinks.push({
            author: username,
            permlink: item.permlink
          });
        });

        elements.metaEl.textContent = `Encontrados ${totalPosts} posts do usuário @${username}. Carregando página 1/${totalPages}...`;

        // Se houver mais páginas, busca-as
        if (totalPages > 1) {
          elements.progressContainer.classList.remove("hidden");
          
          for (let page = 2; page <= totalPages; page++) {
            try {
              const pageData = await fetchUserPermlinks(username, page, 100);
              
              if (pageData.permlinks_result && pageData.permlinks_result.length > 0) {
                pageData.permlinks_result.forEach(item => {
                  allPermlinks.push({
                    author: username,
                    permlink: item.permlink
                  });
                });
              }

              // Atualiza progresso
              const progress = Math.round((page / totalPages) * 100);
              elements.progressFill.style.width = `${progress}%`;
              elements.progressText.textContent = `Carregando posts do usuário: página ${page}/${totalPages} (${allPermlinks.length} posts)`;

              // Pequena pausa para não sobrecarregar a API
              await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
              console.error(`Erro ao buscar página ${page}:`, error);
              // Continua tentando as próximas páginas
            }
          }
          
          elements.progressContainer.classList.add("hidden");
        }

        return {
          stubs: allPermlinks,
          totalPosts: totalPosts,
          totalPages: totalPages
        };
      } catch (error) {
        console.error("Erro ao buscar todos os posts do usuário:", error);
        throw error;
      }
    }

    /**
     * Extrai autor e permlink de uma URL do Hive
     */
    function extractAuthorAndPermlinkFromURL(url) {
      const urlInfo = isHiveURL(url);
      if (urlInfo.isHiveURL) {
        return {
          author: urlInfo.author,
          permlink: urlInfo.permlink,
        };
      }
      return null;
    }

    /**
     * Busca posts similares
     */
    async function fetchSimilarPosts(author, permlink, truncate = 200) {
      try {
        const url = `${API_SIMILAR_POSTS}/${author}/${permlink}/similar?truncate=${truncate}&result_limit=100&full_posts=10`;

        elements.metaEl.textContent = `Buscando posts similares a @${author}/${permlink}...`;

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        console.error("Erro ao buscar posts similares:", error);
        throw error;
      }
    }

    /**
     * Extrai filtros da query
     */
    function extractFiltersFromQuery(query) {
      let cleanQuery = query;
      const filters = {
        authors: [],
        includeTerms: [],
        excludeTerms: [],
      };

      // Extrai autores (@usuario)
      const authorRegex = /@([a-zA-Z0-9.\-_]+)/g;
      let match;
      while ((match = authorRegex.exec(query)) !== null) {
        const author = match[1].toLowerCase();
        if (!filters.authors.includes(author)) {
          filters.authors.push(author);
        }
      }
      cleanQuery = cleanQuery.replace(authorRegex, "");

      // Extrai termos de inclusão (+termo)
      const includeRegex = /\+([a-zA-Z0-9.\-_]+)/g;
      while ((match = includeRegex.exec(query)) !== null) {
        const term = match[1].toLowerCase();
        if (!filters.includeTerms.includes(term)) {
          filters.includeTerms.push(term);
        }
      }
      cleanQuery = cleanQuery.replace(includeRegex, "");

      // Extrai termos de exclusão (-termo)
      const excludeRegex = /-([a-zA-Z0-9.\-_]+)/g;
      while ((match = excludeRegex.exec(query)) !== null) {
        const term = match[1].toLowerCase();
        if (!filters.excludeTerms.includes(term)) {
          filters.excludeTerms.push(term);
        }
      }
      cleanQuery = cleanQuery.replace(excludeRegex, "");

      // Limpa a query (remove múltiplos espaços e trim)
      cleanQuery = cleanQuery.replace(/\s+/g, " ").trim();

      return { cleanQuery, filters };
    }

    /**
     * Atualiza a exibição dos filtros ativos
     */
    function updateActiveFiltersDisplay() {
      elements.filterBadges.innerHTML = "";

      let hasFilters = false;

      // Filtros de autor
      currentSearch.filters.authors.forEach((author) => {
        hasFilters = true;
        const badge = document.createElement("span");
        badge.className =
          "filter-badge px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium flex items-center gap-1";
        badge.innerHTML = `@${author} <button class="text-blue-600 hover:text-blue-800 remove-filter" data-type="author" data-value="${author}">×</button>`;
        elements.filterBadges.appendChild(badge);
      });

      // Filtros de inclusão
      currentSearch.filters.includeTerms.forEach((term) => {
        hasFilters = true;
        const badge = document.createElement("span");
        badge.className =
          "filter-badge px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium flex items-center gap-1";
        badge.innerHTML = `+${term} <button class="text-green-600 hover:text-green-800 remove-filter" data-type="include" data-value="${term}">×</button>`;
        elements.filterBadges.appendChild(badge);
      });

      // Filtros de exclusão
      currentSearch.filters.excludeTerms.forEach((term) => {
        hasFilters = true;
        const badge = document.createElement("span");
        badge.className =
          "filter-badge px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium flex items-center gap-1";
        badge.innerHTML = `-${term} <button class="text-red-600 hover:text-red-800 remove-filter" data-type="exclude" data-value="${term}">×</button>`;
        elements.filterBadges.appendChild(badge);
      });

      // Mostra/oculta container de filtros
      if (hasFilters) {
        elements.activeFilters.classList.remove("hidden");
      } else {
        elements.activeFilters.classList.add("hidden");
      }

      // Adiciona event listeners aos botões de remover filtro
      document.querySelectorAll(".remove-filter").forEach((button) => {
        button.addEventListener("click", (e) => {
          e.stopPropagation();
          const type = button.dataset.type;
          const value = button.dataset.value;
          removeFilter(type, value);
        });
      });
    }

    /**
     * Atualiza a exibição do post original (para busca por link)
     */
    function updateOriginalPostInfo() {
      if (currentSearch.originalPost) {
        const post = currentSearch.originalPost;
        elements.originalPostDetails.innerHTML = `
          <div class="font-medium">${escapeHtml(
            post.title || post.permlink
          )}</div>
          <div class="mt-1">por @${escapeHtml(post.author)} • ${formatDate(
          post.created
        )}</div>
          <div class="mt-1 flex gap-2">
            <a href="https://peakd.com${
              post.url || `/@${post.author}/${post.permlink}`
            }" 
               target="_blank" 
               class="text-blue-600 hover:text-blue-800 text-xs">
              🔗 Ver post original
            </a>
          </div>
        `;
        elements.originalPostInfo.classList.remove("hidden");
      } else {
        elements.originalPostInfo.classList.add("hidden");
      }
    }

    /**
     * Atualiza a exibição das informações do usuário
     */
    function updateUserInfo() {
      if (currentSearch.userInfo) {
        const userInfo = currentSearch.userInfo;
        elements.userDetails.innerHTML = `
          <div class="font-medium">@${escapeHtml(userInfo.username)}</div>
          <div class="mt-1">${userInfo.totalPosts} posts encontrados • ${userInfo.totalPages} páginas</div>
          <div class="mt-1 flex gap-2">
            <a href="https://hive.blog/@${userInfo.username}" 
               target="_blank" 
               class="text-green-600 hover:text-green-800 text-xs">
              🔗 Ver perfil no Hive
            </a>
          </div>
        `;
        elements.userInfo.classList.remove("hidden");
      } else {
        elements.userInfo.classList.add("hidden");
      }
    }

    /**
     * Remove um filtro específico
     */
    function removeFilter(type, value) {
      switch (type) {
        case "author":
          currentSearch.filters.authors =
            currentSearch.filters.authors.filter((a) => a !== value);
          break;
        case "include":
          currentSearch.filters.includeTerms =
            currentSearch.filters.includeTerms.filter((t) => t !== value);
          break;
        case "exclude":
          currentSearch.filters.excludeTerms =
            currentSearch.filters.excludeTerms.filter((t) => t !== value);
          break;
      }

      // Atualiza o campo de busca
      updateSearchInputFromFilters();
      updateActiveFiltersDisplay();

      // Reaplica os filtros e renderiza
      applyFilters();
      renderCurrentPage();
      updatePagination();
    }

    /**
     * Atualiza o campo de busca com base nos filtros atuais
     */
    function updateSearchInputFromFilters() {
      let query = currentSearch.cleanQuery;

      currentSearch.filters.authors.forEach((author) => {
        query += ` @${author}`;
      });

      currentSearch.filters.includeTerms.forEach((term) => {
        query += ` +${term}`;
      });

      currentSearch.filters.excludeTerms.forEach((term) => {
        query += ` -${term}`;
      });

      elements.searchInput.value = query.trim();
    }

    /**
     * Aplica todos os filtros aos posts
     */
    function applyFilters() {
      let filtered = [...currentSearch.allPosts];

      // 1. Filtro por autor (somente posts desses autores)
      if (currentSearch.filters.authors.length > 0) {
        filtered = filtered.filter((post) => {
          const postAuthor = post.author ? post.author.toLowerCase() : "";
          return currentSearch.filters.authors.some(
            (author) => postAuthor === author
          );
        });
      }

      // 2. Filtro de inclusão (+termo) - deve estar na categoria ou tags
      if (currentSearch.filters.includeTerms.length > 0) {
        filtered = filtered.filter((post) => {
          // Verifica categoria
          const category = post.category ? post.category?.toLowerCase() : "";
          const hasCategoryMatch = currentSearch.filters.includeTerms.some(
            (term) => category.includes(term)
          );

          // Verifica tags do json_metadata
          let hasTagMatch = false;
          if (post.json_metadata) {
            try {
              const metadata =
                typeof post.json_metadata === "string"
                  ? JSON.parse(post.json_metadata)
                  : post.json_metadata;

              if (metadata.tags && Array.isArray(metadata.tags)) {
                const tags = metadata.tags.map((tag) => tag?.toLowerCase());
                hasTagMatch = currentSearch.filters.includeTerms.some(
                  (term) => tags?.some((tag) => tag?.includes(term))
                );
              }
            } catch (e) {
              console.error("Erro ao parsear json_metadata:", e);
            }
          }

          return hasCategoryMatch || hasTagMatch;
        });
      }

      // 3. Filtro de exclusão (-termo) - não pode estar na categoria nem tags
      if (currentSearch.filters.excludeTerms.length > 0) {
        filtered = filtered.filter((post) => {
          // Verifica categoria
          const category = post.category ? post.category?.toLowerCase() : "";
          const hasCategoryExclusion =
            currentSearch.filters.excludeTerms.some((term) =>
              category.includes(term)
            );

          if (hasCategoryExclusion) return false;

          // Verifica tags do json_metadata
          if (post.json_metadata) {
            try {
              const metadata =
                typeof post.json_metadata === "string"
                  ? JSON.parse(post.json_metadata)
                  : post.json_metadata;

              if (metadata.tags && Array.isArray(metadata.tags)) {
                const tags = metadata.tags.map((tag) => tag?.toLowerCase());
                const hasTagExclusion =
                  currentSearch.filters.excludeTerms.some((term) =>
                    tags?.some((tag) => tag?.includes(term))
                  );

                if (hasTagExclusion) return false;
              }
            } catch (e) {
              console.error("Erro ao parsear json_metadata:", e);
            }
          }

          return true;
        });
      }

      currentSearch.filteredPosts = filtered;
    }

    /**
     * Aplica o filtro local aos posts
     */
    function applyLocalFilter() {
      const filterText = currentSearch.localFilter.toLowerCase().trim();
      const advancedFilters = currentSearch.advancedFilters;
      
      // Se não há filtro e nem filtros avançados ativos, mostra todos os posts
      if (!filterText && 
          !advancedFilters.dateStart && 
          !advancedFilters.dateEnd && 
          !advancedFilters.category && 
          advancedFilters.minVotes === 0) {
        currentSearch.filteredPosts = [...currentSearch.allPosts];
        return;
      }

      // Começa com todos os posts
      let filtered = [...currentSearch.allPosts];

      // Aplica filtro de texto se existir
      if (filterText) {
        const searchTerms = filterText.split(/\s+/).filter(term => term.length > 0);
        
        filtered = filtered.filter((post) => {
          // Coleta todos os campos de texto para busca
          const searchableText = [
            post.title || '',
            post.body ? post.body.substring(0, 1000) : '', // Limita o corpo para performance
            post.author || '',
            post.category || '',
            post.permlink || ''
          ].join(' ').toLowerCase();

          // Adiciona tags do json_metadata
          if (post.json_metadata) {
            try {
              const metadata = typeof post.json_metadata === 'string' 
                ? JSON.parse(post.json_metadata) 
                : post.json_metadata;
              
              if (metadata.tags && Array.isArray(metadata.tags)) {
                searchableText += ' ' + metadata.tags.join(' ').toLowerCase();
              }
            } catch (e) {
              // Ignora erros de parse
            }
          }

          // Verifica se todos os termos de busca estão presentes
          return searchTerms.every(term => {
            // Verifica se é um ano (4 dígitos)
            if (/^\d{4}$/.test(term)) {
              const postDate = post.created ? new Date(post.created).getFullYear().toString() : '';
              return postDate.includes(term);
            }
            
            // Verifica se é uma hashtag
            if (term.startsWith('#')) {
              const tagToFind = term.substring(1);
              if (post.json_metadata) {
                try {
                  const metadata = typeof post.json_metadata === 'string' 
                    ? JSON.parse(post.json_metadata) 
                    : post.json_metadata;
                  
                  if (metadata.tags && Array.isArray(metadata.tags)) {
                    return metadata.tags.some(tag => 
                      tag.toLowerCase().includes(tagToFind)
                    );
                  }
                } catch (e) {
                  // Ignora erros de parse
                }
              }
              return false;
            }
            
            // Busca normal
            return searchableText.includes(term);
          });
        });
      }

      // Aplica filtros avançados
      filtered = filtered.filter((post) => {
        // Filtro por data inicial
        if (advancedFilters.dateStart) {
          const postDate = post.created ? new Date(post.created) : null;
          if (!postDate || postDate < new Date(advancedFilters.dateStart)) {
            return false;
          }
        }

        // Filtro por data final
        if (advancedFilters.dateEnd) {
          const postDate = post.created ? new Date(post.created) : null;
          const endDate = new Date(advancedFilters.dateEnd);
          endDate.setHours(23, 59, 59, 999); // Fim do dia
          if (!postDate || postDate > endDate) {
            return false;
          }
        }

        // Filtro por categoria
        if (advancedFilters.category) {
          const category = post.category ? post.category.toLowerCase() : '';
          if (!category.includes(advancedFilters.category.toLowerCase())) {
            return false;
          }
        }

        // Filtro por votos mínimos
        if (advancedFilters.minVotes > 0) {
          const votes = post.net_votes || 0;
          if (votes < advancedFilters.minVotes) {
            return false;
          }
        }

        return true;
      });

      currentSearch.filteredPosts = filtered;
      
      // Atualiza estatísticas do filtro
      updateLocalFilterStats();
    }

    /**
     * Atualiza as estatísticas do filtro local
     */
    function updateLocalFilterStats() {
      elements.filteredCount.textContent = currentSearch.filteredPosts.length;
      elements.totalCount.textContent = currentSearch.allPosts.length;
      
      if (currentSearch.localFilter || 
          currentSearch.advancedFilters.dateStart || 
          currentSearch.advancedFilters.dateEnd || 
          currentSearch.advancedFilters.category || 
          currentSearch.advancedFilters.minVotes > 0) {
        elements.localFilterStats.classList.remove("hidden");
      } else {
        elements.localFilterStats.classList.add("hidden");
      }
    }

    /**
     * Extrai a primeira imagem de um corpo de texto
     */
    function firstImageFromBody(body) {
      if (!body) return null;

      const md = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/i.exec(body);
      if (md) return md[1];

      const html = /<img[^>]+src=["']([^"']+)["']/i.exec(body);
      if (html) return html[1];

      const url =
        /(https?:\/\/[^\s"'()]+\.(?:png|jpg|jpeg|gif|webp|bmp))/i.exec(body);
      if (url) return url[1];

      return null;
    }

    /**
     * Formata data para exibição
     */
    function formatDate(iso) {
      try {
        const date = new Date(iso);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMinutes = Math.floor(diffMs / (1000 * 60));

        if (diffMinutes < 60) {
          return `há ${diffMinutes} min`;
        } else if (diffHours < 24) {
          return `há ${diffHours} h`;
        } else if (diffDays < 30) {
          return `há ${diffDays} dias`;
        } else {
          return date.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          });
        }
      } catch (e) {
        return iso;
      }
    }

    /**
     * Formata data completa para tooltip
     */
    function formatFullDate(iso) {
      try {
        const date = new Date(iso);
        return date.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch (e) {
        return iso;
      }
    }

    /**
     * Escapa HTML para segurança
     */
    function escapeHtml(str) {
      let str2 = DOMPurify.sanitize(str);
      if (str2 === null || str2 === undefined) return "";
      const div = document.createElement("div");
      div.textContent = String(str2);
      return div.innerHTML;
    }

    /**
     * Formata valores de payout
     */
    function formatPayout(value) {
      if (!value) return "0.000";
      const num = parseFloat(value);
      return isNaN(num) ? "0.000" : num.toFixed(3);
    }

    /**
     * Mostra/oculta spinner no botão
     */
    function setLoading(loading) {
      if (loading) {
        elements.btnSpinner.classList.remove("hidden");
        elements.btnText.textContent = "Buscando...";
        elements.searchForm.querySelector("button").disabled = true;
      } else {
        elements.btnSpinner.classList.add("hidden");
        elements.btnText.textContent = "Buscar";
        elements.searchForm.querySelector("button").disabled = false;
      }
    }

    /**
     * Atualiza os botões de ordenação ativos
     */
    function updateSortButtons() {
      document.querySelectorAll(".sort-btn").forEach((btn) => {
        btn.classList.remove("active");
      });

      if (currentSearch.sortOrder === "relevance") {
        elements.sortRelevance.classList.add("active");
      } else {
        elements.sortRecent.classList.add("active");
      }
    }

    /**
     * Ordena os posts conforme a ordem selecionada
     */
    function sortPosts(posts) {
      if (currentSearch.sortOrder === "recent") {
        return [...posts].sort((a, b) => {
          const dateA = a.created ? new Date(a.created).getTime() : 0;
          const dateB = b.created ? new Date(b.created).getTime() : 0;
          return dateB - dateA;
        });
      } else {
        // Se for modo similar, mantém a ordem original da API de similares
        if (currentSearch.searchMode === "similar") {
          const orderMap = new Map();
          currentSearch.similarPostsStubs.forEach((stub, index) => {
            orderMap.set(`${stub.author}/${stub.permlink}`, index);
          });

          return [...posts].sort((a, b) => {
            const keyA = `${a.author}/${a.permlink}`;
            const keyB = `${b.author}/${b.permlink}`;
            const indexA = orderMap.get(keyA) ?? Infinity;
            const indexB = orderMap.get(keyB) ?? Infinity;
            return indexA - indexB;
          });
        } else if (currentSearch.searchMode === "user") {
          // Para posts de usuário, ordena por data (mais recente primeiro) por padrão
          return [...posts].sort((a, b) => {
            const dateA = a.created ? new Date(a.created).getTime() : 0;
            const dateB = b.created ? new Date(b.created).getTime() : 0;
            return dateB - dateA;
          });
        } else {
          // Para busca normal, usa a ordem de relevância da busca
          const orderMap = new Map();
          currentSearch.originalSearchResults.forEach((item, index) => {
            orderMap.set(`${item.author}/${item.permlink}`, index);
          });

          return [...posts].sort((a, b) => {
            const indexA =
              orderMap.get(`${a.author}/${a.permlink}`) ?? Infinity;
            const indexB =
              orderMap.get(`${b.author}/${b.permlink}`) ?? Infinity;
            return indexA - indexB;
          });
        }
      }
    }

    /**
     * Busca posts por IDs em lotes (max 50 por lote)
     */
    async function fetchPostsInBatches(stubs) {
      const batches = [];

      for (let i = 0; i < stubs.length; i += BATCH_SIZE) {
        batches.push(stubs.slice(i, i + BATCH_SIZE));
      }

      const allPosts = [];
      let completedBatches = 0;

      elements.progressContainer.classList.remove("hidden");

      for (const batch of batches) {
        try {
          const response = await fetch(API_POSTS_BY_IDS, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              posts: batch.map((stub) => ({
                author: stub.author,
                permlink: stub.permlink,
              })),
              truncate: currentSearch.truncate,
            }),
          });

          if (!response.ok) {
            throw new Error(
              `HTTP ${response.status}: ${response.statusText}`
            );
          }

          const posts = await response.json();
          allPosts.push(...posts.filter(Boolean));

          completedBatches++;
          const progress = Math.round(
            (completedBatches / batches.length) * 100
          );
          elements.progressFill.style.width = `${progress}%`;
          elements.progressText.textContent = `Carregando posts: ${completedBatches}/${batches.length} lotes (${allPosts.length} posts)`;

          if (completedBatches < batches.length) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.error("Erro ao buscar lote de posts:", error);
        }
      }

      elements.progressContainer.classList.add("hidden");
      return allPosts;
    }

    /**
     * Renderiza um post
     */
    function renderPost(post, badgeType = null) {
      if (!post) return "";

      // Extrai imagem do corpo ou do json_metadata
      let image = firstImageFromBody(post.body || "");

      let meta2;
      try {
        meta2 =
          typeof post.json_metadata === "string"
            ? JSON.parse(post.json_metadata)
            : post.json_metadata;
      } catch {}

      if (meta2?.image?.length > 0) {
        image = meta2.image[0];
      }

      if (image) {
        // Usa o proxy de imagens do Hive
        image = `https://images.hive.blog/200x0/${image}`;
      }

      const snippet = post.body
        ? post.body.slice(0, currentSearch.truncate) +
          (post.body.length > currentSearch.truncate ? "…" : "")
        : "";

      const fullDate = formatFullDate(post.created || post.updated || "");
      const displayDate = formatDate(post.created || post.updated || "");

      // Extrai tags do json_metadata para exibição
      let tags = [];
      if (post.json_metadata) {
        try {
          const metadata =
            typeof post.json_metadata === "string"
              ? JSON.parse(post.json_metadata)
              : post.json_metadata;

          if (metadata.tags && Array.isArray(metadata.tags)) {
            tags = metadata.tags.slice(0, 5); // Limita a 5 tags para exibição
          }
        } catch (e) {
          // Ignora erros de parse
        }
      }

      return `
        <article class="bg-white p-4 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
          ${
            badgeType === "similar"
              ? `
          <div class="mb-2">
            <span class="similar-post-badge px-3 py-1 rounded-full text-xs font-bold">
              🔗 Post similar
            </span>
          </div>
          `
              : ""
          }
          ${
            badgeType === "user"
              ? `
          <div class="mb-2">
            <span class="user-posts-badge px-3 py-1 rounded-full text-xs font-bold">
              👤 Post do usuário
            </span>
          </div>
          `
              : ""
          }
          
          <div class="flex flex-col md:flex-row gap-4">
            <div class="md:w-32 flex-shrink-0">
              ${
                image
                  ? `<img src="${image}" alt="thumb" class="h-32 w-full md:w-32 object-cover rounded-md" loading="lazy">`
                  : `<div class="h-32 w-full md:w-32 rounded-md bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-400">
                    Sem imagem
                  </div>`
              }
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex flex-col md:flex-row md:items-baseline justify-between gap-2">
                <h2 class="font-semibold text-lg leading-tight truncate">
                  ${escapeHtml(post.title || post.permlink || "(sem título)")}
                </h2>
                <div class="text-xs text-slate-500 whitespace-nowrap" title="${fullDate}">
                  ${displayDate}
                  ${currentSearch.sortOrder === "recent" ? " 📅" : ""}
                </div>
              </div>
              <div class="mt-1 text-sm text-slate-600">
                por <span class="font-medium">${escapeHtml(
                  post.author || "—"
                )}</span> • 
                Payout: ${formatPayout(
                  post.payout || post.pending_payout_value
                )} HIVE • 
                Votos: ${post.net_votes || 0}
              </div>
              <p class="mt-3 text-slate-700 text-sm whitespace-pre-line">
                ${escapeHtml(snippet)}
              </p>
              <div class="mt-4 flex flex-wrap gap-3 text-xs text-slate-500 items-center">
                <span class="px-2 py-1 bg-slate-100 rounded">👁️ ${
                  post.net_votes || 0
                } votes</span>
                <span class="px-2 py-1 bg-slate-100 rounded">💬 ${
                  post.children || post.replies?.length || 0
                } comments</span>
                <span class="px-2 py-1 bg-slate-100 rounded">🔄 ${
                  post.reblogs || 0
                } reblogs</span>
                <span class="px-2 py-1 bg-slate-100 rounded">🏷️ ${escapeHtml(
                  post.category || "—"
                )}</span>
                ${
                  tags.length > 0
                    ? `
                <div class="flex flex-wrap gap-1">
                  ${tags
                    .map(
                      (tag) => `
                    <span class="px-2 py-1 bg-blue-50 text-blue-600 rounded">${escapeHtml(
                      tag
                    )}</span>
                  `
                    )
                    .join("")}
                </div>
                `
                    : ""
                }
                <div class="ml-auto flex gap-2">
                  <span class="px-2 py-1 bg-blue-50 text-blue-600 rounded">
                    ${
                      currentSearch.sortOrder === "recent"
                        ? "Recent"
                        : "Relevante"
                    }
                  </span>
                  <a href="https://hive.blog${post.url || ""}" target="_blank" 
                     class="px-3 py-1 bg-slate-800 text-white rounded hover:bg-slate-700 transition-colors">
                    Open in Hive
                  </a>
                </div>
              </div>
            </div>
          </div>
        </article>
      `;
    }

    function updatePagination() {
      if (
        !currentSearch.isFetchingComplete ||
        currentSearch.filteredPosts.length === 0
      ) {
        elements.paginationEl.classList.add("hidden");
        return;
      }

      const totalPages = Math.ceil(
        currentSearch.filteredPosts.length / POSTS_PER_PAGE
      );
      const currentPage = currentSearch.currentPage;

      let pageInfo = `Página ${currentPage} de ${totalPages} • ${currentSearch.filteredPosts.length} resultados`;

      if (currentSearch.searchMode === "similar") {
        pageInfo += ` • Posts similares`;
      } else if (currentSearch.searchMode === "user") {
        pageInfo += ` • Posts do usuário`;
      }

      // Adiciona informação sobre filtros
      if (currentSearch.filters.authors.length > 0) {
        pageInfo += ` • Apenas autores: ${currentSearch.filters.authors
          .map((a) => `@${a}`)
          .join(", ")}`;
      }
      if (currentSearch.filters.includeTerms.length > 0) {
        pageInfo += ` • Inclui: ${currentSearch.filters.includeTerms
          .map((t) => `+${t}`)
          .join(", ")}`;
      }
      if (currentSearch.filters.excludeTerms.length > 0) {
        pageInfo += ` • Exclui: ${currentSearch.filters.excludeTerms
          .map((t) => `-${t}`)
          .join(", ")}`;
      }

      // Adiciona informação sobre filtro local
      if (currentSearch.localFilter || 
          currentSearch.advancedFilters.dateStart || 
          currentSearch.advancedFilters.dateEnd || 
          currentSearch.advancedFilters.category || 
          currentSearch.advancedFilters.minVotes > 0) {
        pageInfo += ` • Filtro local ativo`;
      }

      pageInfo += ` • Ordenação: ${
        currentSearch.sortOrder === "recent" ? "Most recent" : "Relevance"
      }`;

      elements.pageInfo.textContent = pageInfo;

      elements.prevBtn.disabled = currentPage <= 1;
      elements.nextBtn.disabled = currentPage >= totalPages;

      elements.pageNumbers.innerHTML = "";

      const maxVisiblePages = 5;
      let startPage = Math.max(
        1,
        currentPage - Math.floor(maxVisiblePages / 2)
      );
      let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

      if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
      }

      for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement("button");
        pageBtn.className = `min-w-8 h-8 px-2 rounded-lg ${
          i === currentPage
            ? "bg-slate-800 text-white"
            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
        }`;
        pageBtn.textContent = i;
        pageBtn.addEventListener("click", () => goToPage(i));
        elements.pageNumbers.appendChild(pageBtn);
      }

      elements.paginationEl.classList.toggle("hidden", totalPages <= 1);
    }

    function renderCurrentPage() {
      if (
        !currentSearch.isFetchingComplete ||
        currentSearch.filteredPosts.length === 0
      ) {
        if (
          currentSearch.isFetchingComplete &&
          currentSearch.allPosts.length > 0
        ) {
          // Há posts mas nenhum passou nos filtros
          elements.resultsEl.innerHTML = `
            <div class="p-8 text-center text-slate-500">
              <div class="text-4xl mb-2">🔍</div>
              <p class="text-lg">Nenhum post encontrado com os filtros aplicados.</p>
              <p class="text-sm mt-2">Tente ajustar os filtros ou limpar alguns deles.</p>
            </div>
          `;
        } else {
          elements.resultsEl.innerHTML = "";
        }
        return;
      }

      const sortedPosts = sortPosts(currentSearch.filteredPosts);

      const startIndex = (currentSearch.currentPage - 1) * POSTS_PER_PAGE;
      const endIndex = startIndex + POSTS_PER_PAGE;

      const pagePosts = sortedPosts.slice(startIndex, endIndex);

      let badgeType = null;
      if (currentSearch.searchMode === "similar") {
        badgeType = "similar";
      } else if (currentSearch.searchMode === "user") {
        badgeType = "user";
      }

      elements.resultsEl.innerHTML = pagePosts
        .map((post) => renderPost(post, badgeType))
        .join("");

      if (pagePosts.length === 0) {
        elements.resultsEl.innerHTML = `
          <div class="p-8 text-center text-slate-500">
            <div class="text-4xl mb-2">😕</div>
            <p class="text-lg">Nenhum post encontrado nesta página.</p>
          </div>
        `;
      }
    }

    function goToPage(page) {
      if (!currentSearch.isFetchingComplete) return;

      const totalPages = Math.ceil(
        currentSearch.filteredPosts.length / POSTS_PER_PAGE
      );
      if (page < 1 || page > totalPages) {
        return;
      }

      currentSearch.currentPage = page;
      renderCurrentPage();
      updatePagination();
      window.scrollTo({
        top: elements.resultsEl.offsetTop - 100,
        behavior: "smooth",
      });
    }

    /**
     * Executa busca por posts similares
     */
    async function doSimilarPostsSearch(url, truncate = 200) {
      const urlInfo = extractAuthorAndPermlinkFromURL(url);
      if (!urlInfo) {
        elements.metaEl.textContent =
          "URL inválida. Use um link do Hive (hive.blog, ecency.com, peakd.com, etc.)";
        return;
      }

      setLoading(true);
      elements.resultsEl.innerHTML = "";
      elements.metaEl.textContent = `Buscando posts similares a @${urlInfo.author}/${urlInfo.permlink}...`;
      elements.paginationEl.classList.add("hidden");
      elements.originalPostInfo.classList.add("hidden");
      elements.userInfo.classList.add("hidden");
      elements.localFilterContainer.classList.add("hidden");
      updateSortButtons();

      try {
        // Primeiro, busca o post original para mostrar informações
        const originalPostResponse = await fetch(API_POSTS_BY_IDS, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            posts: [
              {
                author: urlInfo.author,
                permlink: urlInfo.permlink,
              },
            ],
            truncate: truncate,
          }),
        });

        if (originalPostResponse.ok) {
          const originalPosts = await originalPostResponse.json();
          if (originalPosts && originalPosts.length > 0) {
            currentSearch.originalPost = originalPosts[0];
            updateOriginalPostInfo();
          }
        }

        // Agora busca posts similares
        elements.metaEl.textContent = `Buscando posts similares a @${urlInfo.author}/${urlInfo.permlink}...`;
        const similarPosts = await fetchSimilarPosts(
          urlInfo.author,
          urlInfo.permlink,
          truncate
        );

        if (!similarPosts || similarPosts.length === 0) {
          elements.metaEl.textContent = "Nenhum post similar encontrado.";
          elements.resultsEl.innerHTML = `
            <div class="p-8 text-center text-slate-500">
              <div class="text-4xl mb-2">🔍</div>
              <p class="text-lg">Nenhum post similar encontrado para este post.</p>
              <p class="text-sm mt-2">Tente buscar por palavras-chave relacionadas.</p>
            </div>
          `;
          return;
        }

        // Extrai os stubs (author, permlink) dos posts similares
        const stubs = similarPosts.map((item) => ({
          author: item.author,
          permlink: item.permlink,
        }));

        // Armazena os stubs para manter a ordem original
        currentSearch.similarPostsStubs = stubs;

        // Busca os detalhes completos de todos os posts similares em lotes
        elements.metaEl.textContent = `Encontrados ${stubs.length} posts similares. Carregando detalhes...`;
        const allPosts = await fetchPostsInBatches(stubs);

        // Atualiza estado
        currentSearch.searchMode = "similar";
        currentSearch.allPosts = allPosts;
        currentSearch.filteredPosts = [...allPosts]; // Inicialmente, todos os posts
        currentSearch.isFetchingComplete = true;
        currentSearch.currentPage = 1;

        // Aplica filtros (se houver)
        applyFilters();

        // Mostra o filtro local
        elements.localFilterContainer.classList.remove("hidden");

        // Renderiza primeira página
        renderCurrentPage();
        updatePagination();

        elements.metaEl.textContent = `Found ${
          allPosts.length
        } Similar posts • Sorting: ${
          currentSearch.sortOrder === "recent" ? "Most recent" : "Relevance"
        }`;
      } catch (error) {
        console.error("Error searching for similar posts:", error);
        elements.metaEl.innerHTML = `<span class="text-red-600">Erro na busca: ${error.message}</span>`;
        elements.resultsEl.innerHTML = `
          <div class="p-4 text-red-600 bg-red-50 rounded-lg">
            Failed to find similar posts. Please check that the link is correct and try again.
          </div>
        `;
      } finally {
        setLoading(false);
      }
    }

    /**
     * Executa busca por posts de um usuário específico
     */
    async function doUserPostsSearch(username, truncate = 200) {
      setLoading(true);
      elements.resultsEl.innerHTML = "";
      elements.metaEl.textContent = `Buscando posts do usuário @${username}...`;
      elements.paginationEl.classList.add("hidden");
      elements.originalPostInfo.classList.add("hidden");
      elements.userInfo.classList.add("hidden");
      elements.localFilterContainer.classList.add("hidden");
      updateSortButtons();

      try {
        // Busca todos os permlinks do usuário
        const userPostsData = await fetchAllUserPosts(username);
        
        if (!userPostsData.stubs || userPostsData.stubs.length === 0) {
          elements.metaEl.textContent = `Nenhum post encontrado para o usuário @${username}.`;
          elements.resultsEl.innerHTML = `
            <div class="p-8 text-center text-slate-500">
              <div class="text-4xl mb-2">👤</div>
              <p class="text-lg">Nenhum post encontrado para o usuário @${username}.</p>
              <p class="text-sm mt-2">Verifique se o nome de usuário está correto.</p>
            </div>
          `;
          return;
        }

        // Atualiza informações do usuário
        currentSearch.userInfo = {
          username: username,
          totalPosts: userPostsData.totalPosts,
          totalPages: userPostsData.totalPages
        };
        updateUserInfo();

        // Busca os detalhes completos de todos os posts em lotes
        elements.metaEl.textContent = `Encontrados ${userPostsData.stubs.length} posts do usuário @${username}. Carregando detalhes...`;
        const allPosts = await fetchPostsInBatches(userPostsData.stubs);

        // Atualiza estado
        currentSearch.searchMode = "user";
        currentSearch.allPosts = allPosts;
        currentSearch.filteredPosts = [...allPosts];
        currentSearch.isFetchingComplete = true;
        currentSearch.currentPage = 1;

        // Aplica filtros (se houver)
        applyFilters();

        // Mostra o filtro local
        elements.localFilterContainer.classList.remove("hidden");

        // Renderiza primeira página
        renderCurrentPage();
        updatePagination();

        elements.metaEl.textContent = `Carregados ${allPosts.length} posts do usuário @${username} • Ordenação: ${
          currentSearch.sortOrder === "recent" ? "Most recent" : "Relevance"
        }`;
      } catch (error) {
        console.error("Error searching for user posts:", error);
        elements.metaEl.innerHTML = `<span class="text-red-600">Erro na busca: ${error.message}</span>`;
        elements.resultsEl.innerHTML = `
          <div class="p-4 text-red-600 bg-red-50 rounded-lg">
            Falha ao buscar posts do usuário. Verifique se o nome de usuário está correto e tente novamente.
          </div>
        `;
      } finally {
        setLoading(false);
      }
    }

    /**
     * Executa busca normal (não por link ou usuário)
     */
    async function doNormalSearch(q, truncate = 200) {
      // Extrai filtros da query
      const { cleanQuery, filters } = extractFiltersFromQuery(q);

      // Atualiza estado
      currentSearch.searchMode = "normal";
      currentSearch.originalPost = null;
      currentSearch.userInfo = null;
      currentSearch.similarPostsStubs = [];
      currentSearch.query = q;
      currentSearch.cleanQuery = cleanQuery;
      currentSearch.truncate = truncate;
      currentSearch.sortOrder = "relevance";
      currentSearch.allPosts = [];
      currentSearch.filteredPosts = [];
      currentSearch.currentPage = 1;
      currentSearch.totalResults = 0;
      currentSearch.isFetchingComplete = false;
      currentSearch.originalSearchResults = [];
      currentSearch.filters = filters;

      setLoading(true);
      elements.resultsEl.innerHTML = "";
      elements.metaEl.textContent = "Buscando...";
      elements.paginationEl.classList.add("hidden");
      elements.originalPostInfo.classList.add("hidden");
      elements.userInfo.classList.add("hidden");
      elements.localFilterContainer.classList.add("hidden");
      updateSortButtons();
      updateActiveFiltersDisplay();

      // Se não há query após remover filtros
      if (!cleanQuery && filters.authors.length === 0) {
        setLoading(false);
        elements.metaEl.textContent =
          "Digite uma pesquisa ou use @autor para buscar posts de um autor específico";
        return;
      }

      try {
        const searchQuery = cleanQuery;

        const params = new URLSearchParams({
          q: searchQuery,
          truncate: String(truncate),
          result_limit: String(MAX_RESULTS),
          full_posts: "0",
        });

        const response = await fetch(`${API_BASE}?${params}`);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const results = Array.isArray(data) ? data : data.results || [];

        if (results.length === 0) {
          elements.metaEl.textContent = "Nenhum resultado encontrado.";
          if (filters.authors.length > 0) {
            elements.metaEl.textContent += ` Nenhum post encontrado para os autores: ${filters.authors
              .map((a) => `@${a}`)
              .join(", ")}`;
          }
          elements.resultsEl.innerHTML = `
            <div class="p-8 text-center text-slate-500">
              <div class="text-4xl mb-2">🔍</div>
              <p class="text-lg">Nenhum resultado encontrado para "${escapeHtml(
                q
              )}".</p>
              ${
                filters.authors.length > 0
                  ? `<p class="text-sm mt-2">Procurando por autores: ${filters.authors
                      .map((a) => `@${a}`)
                      .join(", ")}</p>`
                  : ""
              }
            </div>
          `;
          return;
        }

        currentSearch.originalSearchResults = results;
        currentSearch.totalResults = results.length;

        let metaText = `Found ${results.length} resultados`;
        if (filters.authors.length > 0) {
          metaText += `. Filtrando por autores: ${filters.authors
            .map((a) => `@${a}`)
            .join(", ")}`;
        }
        if (filters.includeTerms.length > 0) {
          metaText += `. Incluindo termos: ${filters.includeTerms
            .map((t) => `+${t}`)
            .join(", ")}`;
        }
        if (filters.excludeTerms.length > 0) {
          metaText += `. Excluindo termos: ${filters.excludeTerms
            .map((t) => `-${t}`)
            .join(", ")}`;
        }
        metaText += `. Carregando detalhes...`;
        elements.metaEl.textContent = metaText;

        const stubs = results.map((item) => ({
          author: item.author,
          permlink: item.permlink,
        }));

        const allPosts = await fetchPostsInBatches(stubs);

        currentSearch.allPosts = allPosts;
        currentSearch.isFetchingComplete = true;

        // Aplica filtros
        applyFilters();

        // Mostra o filtro local
        elements.localFilterContainer.classList.remove("hidden");

        // Renderiza primeira página
        renderCurrentPage();
        updatePagination();

        // Atualiza meta informações
        let finalMetaText = `Carregados ${allPosts.length} posts`;
        if (currentSearch.filteredPosts.length !== allPosts.length) {
          finalMetaText += ` • ${currentSearch.filteredPosts.length} after filters`;
        }
        finalMetaText += ` • Ordenação: ${
          currentSearch.sortOrder === "recent" ? "Most recent" : "Relevance"
        }`;

        elements.metaEl.textContent = finalMetaText;
      } catch (error) {
        console.error("Erro na busca:", error);
        elements.metaEl.innerHTML = `<span class="text-red-600">Erro na busca: ${error.message}</span>`;
        elements.resultsEl.innerHTML = `
          <div class="p-4 text-red-600 bg-red-50 rounded-lg">
            Falha ao buscar resultados. Verifique sua conexão e tente novamente.
          </div>
        `;
      } finally {
        setLoading(false);
      }
    }

    /**
     * Executa a busca principal
     */
    async function doSearch(q, truncate = 200) {
      // Limpa o filtro local antes de uma nova busca
      elements.localFilter.value = "";
      currentSearch.localFilter = "";
      resetAdvancedFilters();
      
      // Verifica se é uma URL do Hive
      const urlInfo = isHiveURL(q);
      if (urlInfo.isHiveURL) {
        await doSimilarPostsSearch(q, truncate);
        return;
      }

      // Verifica se é uma busca por usuário (@username apenas)
      const userInfo = isUserSearch(q);
      if (userInfo.isUserSearch) {
        await doUserPostsSearch(userInfo.username, truncate);
        return;
      }

      // Caso contrário, faz busca normal
      await doNormalSearch(q, truncate);
    }

    /**
     * Aplica o filtro local quando o usuário digita
     */
    function handleLocalFilter() {
      currentSearch.localFilter = elements.localFilter.value;
      applyLocalFilter();
      currentSearch.currentPage = 1;
      renderCurrentPage();
      updatePagination();
    }

    /**
     * Aplica os filtros avançados
     */
    function handleAdvancedFilters() {
      currentSearch.advancedFilters = {
        dateStart: elements.filterDateStart.value || null,
        dateEnd: elements.filterDateEnd.value || null,
        category: elements.filterCategory.value.trim(),
        minVotes: parseInt(elements.filterMinVotes.value) || 0
      };
      
      applyLocalFilter();
      currentSearch.currentPage = 1;
      renderCurrentPage();
      updatePagination();
    }

    /**
     * Reseta os filtros avançados
     */
    function resetAdvancedFilters() {
      elements.filterDateStart.value = "";
      elements.filterDateEnd.value = "";
      elements.filterCategory.value = "";
      elements.filterMinVotes.value = "";
      
      currentSearch.advancedFilters = {
        dateStart: null,
        dateEnd: null,
        category: "",
        minVotes: 0
      };
    }

    function toggleSortOrder(newSortOrder) {
      if (
        currentSearch.sortOrder === newSortOrder ||
        !currentSearch.isFetchingComplete
      )
        return;

      currentSearch.sortOrder = newSortOrder;
      currentSearch.currentPage = 1;

      updateSortButtons();
      renderCurrentPage();
      updatePagination();

      let metaText = `Carregados ${currentSearch.allPosts.length} posts`;
      if (currentSearch.searchMode === "similar") {
        metaText = `Found ${currentSearch.allPosts.length} posts similar`;
      } else if (currentSearch.searchMode === "user") {
        metaText = `Carregados ${currentSearch.allPosts.length} posts do usuário`;
      } else if (
        currentSearch.filteredPosts.length !== currentSearch.allPosts.length
      ) {
        metaText += ` • ${currentSearch.filteredPosts.length} after filters`;
      }
      metaText += ` • Ordenação: ${
        currentSearch.sortOrder === "recent" ? "Most recent" : "Relevance"
      }`;

      elements.metaEl.textContent = metaText;
    }

    /**
     * Limpa todos os filtros
     */
    function clearAllFilters() {
      currentSearch.filters = {
        authors: [],
        includeTerms: [],
        excludeTerms: [],
      };

      elements.searchInput.value = currentSearch.cleanQuery;
      updateActiveFiltersDisplay();

      // Reaplica filtros (que agora estão vazios)
      applyFilters();
      currentSearch.currentPage = 1;
      renderCurrentPage();
      updatePagination();
    }

    // Event Listeners
    elements.searchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = elements.searchInput.value.trim();
      const truncate = Number(elements.truncateSelect.value) || 200;

      if (!q) {
        alert("Digite um termo para buscar ou cole um link do Hive");
        return;
      }

      doSearch(q, truncate);
    });

    elements.sortRelevance.addEventListener("click", () => {
      toggleSortOrder("relevance");
    });

    elements.sortRecent.addEventListener("click", () => {
      toggleSortOrder("recent");
    });

    elements.clearFilters.addEventListener("click", clearAllFilters);

    elements.closeOriginalPostInfo.addEventListener("click", () => {
      elements.originalPostInfo.classList.add("hidden");
    });

    elements.closeUserInfo.addEventListener("click", () => {
      elements.userInfo.classList.add("hidden");
    });

    // Filtro Local
    elements.localFilter.addEventListener("input", handleLocalFilter);
    elements.localFilter.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleLocalFilter();
      }
    });

    elements.clearLocalFilter.addEventListener("click", () => {
      elements.localFilter.value = "";
      currentSearch.localFilter = "";
      resetAdvancedFilters();
      handleLocalFilter();
    });

    // Filtros Avançados
    elements.advancedFilterToggle.addEventListener("click", () => {
      elements.advancedFilters.classList.toggle("hidden");
      if (!elements.advancedFilters.classList.contains("hidden")) {
        elements.advancedFilterToggle.textContent = "Ocultar Filtros";
        elements.advancedFilterToggle.classList.add("bg-blue-200");
      } else {
        elements.advancedFilterToggle.textContent = "Filtros Avançados";
        elements.advancedFilterToggle.classList.remove("bg-blue-200");
      }
    });

    elements.applyAdvancedFilters.addEventListener("click", handleAdvancedFilters);
    elements.resetAdvancedFilters.addEventListener("click", () => {
      resetAdvancedFilters();
      handleAdvancedFilters();
    });

    // Permitir Enter nos campos de filtro avançado
    [elements.filterDateStart, elements.filterDateEnd, elements.filterCategory, elements.filterMinVotes]
      .forEach(input => {
        input.addEventListener("keypress", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleAdvancedFilters();
          }
        });
      });

    elements.prevBtn.addEventListener("click", () =>
      goToPage(currentSearch.currentPage - 1)
    );
    elements.nextBtn.addEventListener("click", () =>
      goToPage(currentSearch.currentPage + 1)
    );

    // Placeholder com exemplos
    elements.searchInput.placeholder =
      "Ex: @sm-silva anime +life -comics ou URL do post Hive";

    // Busca inicial
    window.addEventListener("DOMContentLoaded", () => {
      const q = elements.searchInput.value.trim();
      const truncate = Number(elements.truncateSelect.value) || 200;
      doSearch(q, truncate);
    });
