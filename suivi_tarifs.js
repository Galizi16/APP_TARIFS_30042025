// --- START OF FILE suivi_tarifs.js ---
import {
    loadAppData,
    getAllPartners,
    getAllCategories,
    getCategoryToPlansMap,
    getPlanToCategoriesMap,
    getPartnerToPlansMap,
    getOriginalPlanOrder,
    ratePlanDescriptions,
    getAllPlans,
    getBaseRates,
    getTravcoBaseRates
} from './api.js';
import { calculateDailyRate } from './calcul.js';
import {
    showAppMessage,
    showLoading,
    hideResult,
    formatDateYYYYMMDD,
    formatDateLocale,
    generateStayDates,
    getElementValue,
    getElementValueAsInt,
    populateDropdown
} from './utils.js';

console.log("suivi_tarifs.js module loaded.");


// --- État de l'interface dynamique (Spécifique à Suivi) ---
let comparisonBlockCounter = 0; // Compteur pour les blocs partenaire/plan
let tarifsChart = null; // Instance de Chart.js


// ==========================================================================
// ==               FONCTIONS D'INTERFACE SPÉCIFIQUES (SUIVI)              ==
// ==========================================================================

// Définir toutes les fonctions d'interface/helpers ici, AVANT initializeSuiviApp
// Cela inclut les fonctions appelées directement par initializeSuiviApp ou par les listeners setup ici.

function disableSuiviForm() {
    console.log("SUIVI: Désactivation du formulaire.");
    const form = document.getElementById('suiviForm');
    if (form) {
        form.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
    }
     document.getElementById('suivi-addPartnerBtn')?.setAttribute('disabled', 'true');
     document.getElementById('refreshBtn')?.setAttribute('disabled', 'true');
     hideResult('suivi-result-container'); // S'assure qu'il est caché et vidé
}

function enableSuiviForm() {
    console.log("SUIVI: Activation du formulaire.");
    const form = document.getElementById('suiviForm');
    if (form) {
        form.querySelectorAll('input, select, button').forEach(el => el.disabled = false);
    }
     document.getElementById('suivi-addPartnerBtn')?.removeAttribute('disabled');
     document.getElementById('refreshBtn')?.removeAttribute('disabled');
     // Les selects partenaires/plans/catégories seront activés/désactivés par leur logique de peuplement et de cascade
}

// initializeChart est maintenant appelée par handleSuiviFormSubmit, mais sa définition est toujours utile ici
function initializeChart() {
    // Cette fonction ne fait plus grand chose ici, car le graphique est créé DANS generateChart
    // Elle sert juste à s'assurer que la variable est initialisée.
     console.log("SUIVI: Initialisation variable tarifsChart.");
     tarifsChart = null; // Assure que l'instance précédente est effacée si on réinitialise
}

function updateRatePlanHelpSuivi(planCode, helpTextElement) {
    if (helpTextElement) {
        const description = ratePlanDescriptions[planCode];
        helpTextElement.textContent = description || (planCode ? '' : '');
    }
}

function updateRoomCategoryOptionsSuivi() {
     console.log("SUIVI.updateRoomCategoryOptionsSuivi");
     const categorySelect = document.getElementById('suivi-room-category');
     if (!categorySelect) { console.warn("SUIVI: Category select element not found."); return; }

     const sortedCategories = [...getAllCategories()].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
     populateDropdown(categorySelect.id, new Set(sortedCategories), "Sélectionnez une catégorie");
     categorySelect.disabled = sortedCategories.length === 0;

     if (sortedCategories.length > 0) {
               if (!categorySelect.value && categorySelect.options.length > 1) {
                    categorySelect.selectedIndex = 1;
                    console.log(`SUIVI.updateRoomCategoryOptionsSuivi: Auto-selected category: ${categorySelect.value}`);
               }
          updateAllComparisonPlanOptions(); // Déclenche la mise à jour des plans basés sur la catégorie sélectionnée

     } else {
           updateAllComparisonPlanOptions(); // Appelle même si pas de catégorie pour vider/désactiver les plans
     }
}

function updateAllComparisonPlanOptions() {
     console.log("SUIVI: Mise à jour de tous les plans dans les blocs de comparaison...");
     const comparisonBlocks = document.querySelectorAll('#partnerComparisonsContainer .partner-comparison-block');
     comparisonBlocks.forEach(block => {
          updateComparisonPlanOptionsSuivi(block);
     });
}


function updateComparisonPlanOptionsSuivi(comparisonBlockElement) {
    const partnerSelect = comparisonBlockElement.querySelector('.partner-select-suivi');
    const planSelect = comparisonBlockElement.querySelector('.plan-select-suivi');
    const helpTextElement = comparisonBlockElement.querySelector('.rate-plan-help-suivi');

    if (!partnerSelect || !planSelect) { console.error("SUIVI: Éléments select partner/plan introuvables dans le bloc."); return; }

    const selectedPartner = partnerSelect.value;
    const selectedCategory = getElementValue('suivi-room-category');

    let placeholder = "Sélectionnez Catégorie/Partenaire...";
    let optionsToPopulate = new Set();
    let orderSourceCategory = null;


    if (!selectedCategory) {
         placeholder = "Sélectionnez une catégorie...";
         optionsToPopulate = new Set();
         orderSourceCategory = null;
    } else {
        orderSourceCategory = selectedCategory;
        const plansForCategory = getCategoryToPlansMap().get(selectedCategory) || new Set();

        if (!selectedPartner) {
             placeholder = "Sélectionnez un partenaire...";
             optionsToPopulate = new Set();
        } else {
            const plansForPartner = getPartnerToPlansMap().get(selectedPartner) || new Set();
            optionsToPopulate = new Set([...plansForCategory].filter(plan => plansForPartner.has(plan)));
            if (optionsToPopulate.size === 0) {
                placeholder = "Aucun plan pour cette combinaison";
            } else {
                placeholder = "Sélectionnez Plan...";
            }
        }
    }

    let orderedPlans = [];
    const originalPlanOrderMap = getOriginalPlanOrder();
    if (orderSourceCategory && originalPlanOrderMap[orderSourceCategory]) {
        orderedPlans = originalPlanOrderMap[orderSourceCategory].filter(plan => optionsToPopulate.has(plan));
        const remainingPlans = [...optionsToPopulate].filter(plan => !orderedPlans.includes(plan));
        remainingPlans.sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
        orderedPlans = [...orderedPlans, ...remainingPlans];
    } else {
        orderedPlans = [...optionsToPopulate].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    }

    populateDropdown(planSelect.id, new Set(orderedPlans), placeholder);
    const currentVal = planSelect.value;
    if (planSelect.querySelector(`option[value="${currentVal}"]`)) {
        planSelect.value = currentVal;
    } else {
        planSelect.value = "";
    }

    planSelect.disabled = !selectedPartner || !selectedCategory || orderedPlans.length === 0;

    updateRatePlanHelpSuivi(planSelect.value, helpTextElement);

    if (planSelect.dataset.listenerAttached !== 'true') {
        planSelect.addEventListener('change', (e) => {
             updateRatePlanHelpSuivi(e.target.value, helpTextElement);
        });
        planSelect.dataset.listenerAttached = 'true';
    }
}

function addPartnerComparisonBlock() {
     comparisonBlockCounter++;
     const container = document.getElementById('partnerComparisonsContainer');
     if (!container) { console.error("SUIVI: Conteneur des blocs de comparaison introuvable."); return; }

     const blockId = `suivi-comparison-block-${comparisonBlockCounter}`;
     const partnerSelectId = `suivi-partner-${comparisonBlockCounter}`;
     const planSelectId = `suivi-plan-${comparisonBlockCounter}`;
     const helpTextId = `suivi-plan-help-${comparisonBlockCounter}`;

     const partnerBlockDiv = document.createElement('div');
     partnerBlockDiv.id = blockId;
     partnerBlockDiv.className = 'partner-comparison-block space-y-3 fade-in';

     // Note : required ajouté aux selects
     partnerBlockDiv.innerHTML = `
         <div class="flex justify-between items-center mb-2">
             <h5 class="font-medium text-gray-300">Plan de Comparaison ${comparisonBlockCounter}</h5>
             ${comparisonBlockCounter > 2 ? `<button type="button" class="remove-btn text-red-400 hover:text-red-300" data-block-id="${blockId}" aria-label="Supprimer"><i class="fas fa-times"></i></button>` : ''}
         </div>
         <div>
             <label for="${partnerSelectId}" class="label-style">Partenaire</label>
             <select id="${partnerSelectId}" class="partner-select-suivi input-style w-full" required disabled>
                 <option value="">Chargement...</option>
             </select>
         </div>
         <div>
             <label for="${planSelectId}" class="label-style">Plan Tarifaire</label>
             <select id="${planSelectId}" class="plan-select-suivi input-style w-full" required disabled>
                 <option value="">Sélectionnez Catégorie/Partenaire...</option>
             </select>
             <div id="${helpTextId}" class="form-text-style rate-info rate-plan-help-suivi"></div>
         </div>
     `;

     container.appendChild(partnerBlockDiv);

     const partnerSelect = partnerBlockDiv.querySelector(`#${partnerSelectId}`);
     const planSelect = partnerBlockDiv.querySelector(`#${planSelectId}`);
     const helpTextElement = partnerBlockDiv.querySelector(`#${helpTextId}`);

     // Peuple le select partenaire
     const sortedPartners = [...getAllPartners()].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
     populateDropdown(partnerSelectId, new Set(sortedPartners), "Sélectionner un partenaire"); // Utilise utilitaire

     // Attache listeners au nouveau bloc
     partnerSelect.addEventListener('change', () => {
          console.log(`SUIVI: Partner changed in block ${comparisonBlockCounter} to ${partnerSelect.value}`);
          updateComparisonPlanOptionsSuivi(partnerBlockDiv);
          planSelect.value = "";
          updateRatePlanHelpSuivi(planSelect.value, helpTextElement);
           const selectedCategory = getElementValue('suivi-room-category');
           planSelect.disabled = !partnerSelect.value || !selectedCategory || planSelect.querySelectorAll('option').length <= 1;
     });

     const removeBtn = partnerBlockDiv.querySelector('.remove-btn');
     if (removeBtn) {
         removeBtn.addEventListener('click', () => {
             console.log(`SUIVI: Removing block ${blockId}`);
             container.removeChild(partnerBlockDiv);
             document.querySelectorAll('#partnerComparisonsContainer .partner-comparison-block').forEach((block, index) => {
                  block.querySelector('h5').textContent = `Plan de Comparaison ${index + 1}`;
                  if (index < 2) {
                       const btn = block.querySelector('.remove-btn');
                       if (btn) btn.remove();
                  }
             });

             if (document.querySelectorAll('#partnerComparisonsContainer .partner-comparison-block').length < 4) {
                  document.getElementById('suivi-addPartnerBtn').classList.remove('hidden');
             }
         });
     }

     // Mettre à jour les options de plan initiales (dépend de la catégorie déjà sélectionnée)
     updateComparisonPlanOptionsSuivi(partnerBlockDiv);

     if (document.querySelectorAll('#partnerComparisonsContainer .partner-comparison-block').length < 4) {
         document.getElementById('suivi-addPartnerBtn')?.classList.remove('hidden');
     } else {
         document.getElementById('suivi-addPartnerBtn')?.classList.add('hidden');
     }
}

function setupSuiviEventListeners() {
     console.log("SUIVI: Attachement des listeners du formulaire de comparaison...");
    document.getElementById('suiviForm')?.addEventListener('submit', handleSuiviFormSubmit);
    document.getElementById('suivi-addPartnerBtn')?.addEventListener('click', () => {
         if (document.querySelectorAll('#partnerComparisonsContainer .partner-comparison-block').length < 4) {
             addPartnerComparisonBlock();
             if (document.querySelectorAll('#partnerComparisonsContainer .partner-comparison-block').length >= 4) {
                 document.getElementById('suivi-addPartnerBtn').classList.add('hidden');
             }
         }
     });
     document.getElementById('suivi-room-category')?.addEventListener('change', () => {
         console.log("SUIVI: Catégorie changée, mise à jour des plans dans tous les blocs...");
         updateAllComparisonPlanOptions();
          document.querySelectorAll('.plan-select-suivi').forEach(select => {
               select.value = "";
               const helpTextElement = select.closest('.partner-comparison-block').querySelector('.rate-plan-help-suivi');
               updateRatePlanHelpSuivi(select.value, helpTextElement);
               select.disabled = !select.querySelector('option[value=""]')?.selected && select.querySelectorAll('option').length > 1;
          });
     });
     document.getElementById('refreshBtn')?.addEventListener('click', resetSuiviForm);
}

function initializeSuiviForm() {
     console.log("SUIVI: Initialisation du formulaire de comparaison...");
    // Set dates par défaut
    try {
        const today = new Date();
        const oneWeekLater = new Date();
        oneWeekLater.setUTCDate(today.getUTCDate() + 7);

        const todayStr = formatDateYYYYMMDD(today);
        const oneWeekLaterStr = formatDateYYYYMMDD(oneWeekLater);

        const dateDebutInput = document.getElementById('suivi-dateDebut');
        const dateFinInput = document.getElementById('suivi-dateFin');

        if (dateDebutInput) {
             console.log("SUIVI: Setting default start date.");
             dateDebutInput.value = todayStr;
             dateDebutInput.disabled = false; // Ensure date inputs are enabled
        }
        if (dateFinInput) {
             console.log("SUIVI: Setting default end date (1 week later).");
             dateFinInput.value = oneWeekLaterStr;
             dateFinInput.disabled = false; // Ensure date inputs are enabled
        } else {
            console.warn("SUIVI: Date input elements not found.");
        }

    } catch (e) { console.error("SUIVI: Erreur mise à jour date défaut:", e); }

    // Peuple la catégorie de chambre
    updateRoomCategoryOptionsSuivi(); // Cette fonction peuple et active le select catégorie

    // Ajoute les blocs de comparaison initiaux (Partenaire/Plan)
    // Leurs dropdowns Partenaire sont peuplés ici, les Plans dépendent de la catégorie
    addPartnerComparisonBlock();
    addPartnerComparisonBlock(); // Ajouter un deuxième bloc par défaut pour la comparaison

     // Cache/montre le bouton Ajouter selon la limite
     if (document.querySelectorAll('#partnerComparisonsContainer .partner-comparison-block').length >= 4) {
          document.getElementById('suivi-addPartnerBtn')?.classList.add('hidden');
     } else {
         document.getElementById('suivi-addPartnerBtn')?.classList.remove('hidden');
     }

     // Les autres champs du formulaire (type graphique, bouton générer) sont activés par enableSuiviForm.
}


// handleSuiviFormSubmit déclenche le calcul et l'affichage des résultats
async function handleSuiviFormSubmit(event) {
     event.preventDefault();
     console.log("SUIVI: Form submitted.");

     const resultContainer = document.getElementById('suivi-result-container');
     // Clear previous results and add loading indicator BEFORE calculations
     hideResult('suivi-result-container'); // This also hides the container
     showLoading('suivi-result-container', "Génération de la comparaison..."); // This adds loading and makes container visible


     const dateDebut = getElementValue('suivi-dateDebut');
     const dateFin = getElementValue('suivi-dateFin');
     const categorie = getElementValue('suivi-room-category');
     const chartType = getElementValue('suivi-chartType');

     const comparisonItems = [];
     const comparisonBlocks = document.querySelectorAll('#partnerComparisonsContainer .partner-comparison-block');

     comparisonBlocks.forEach(block => {
         const partnerSelect = block.querySelector('.partner-select-suivi');
         const planSelect = block.querySelector('.plan-select-suivi');
         if (partnerSelect?.value && planSelect?.value) {
             comparisonItems.push({
                 partner: partnerSelect.value,
                 plan: planSelect.value
             });
         }
     });

     // Validate inputs AFTER getting values
     if (!dateDebut || !dateFin || !categorie) {
         showAppMessage('suivi-global-message-area', 'Veuillez sélectionner une période et une catégorie.', 'warning');
         hideResult('suivi-result-container'); // Hide loading and container
         return;
     }
     if (comparisonItems.length < 2) {
         showAppMessage('suivi-global-message-area', 'Veuillez ajouter et sélectionner au moins deux plans à comparer.', 'warning');
         hideResult('suivi-result-container'); // Hide loading and container
         return;
     }

     const selectedPlanKeys = comparisonItems.map(item => `${item.partner}-${item.plan}`);
     const uniquePlanKeys = new Set(selectedPlanKeys);
     if (uniquePlanKeys.size !== selectedPlanKeys.length) {
          showAppMessage('suivi-global-message-area', 'Veuillez sélectionner des combinaisons Partenaire/Plan uniques pour chaque élément de comparaison.', 'warning');
          hideResult('suivi-result-container'); // Hide loading and container
          return;
     }


     let stayDates;
     try {
          const startDate = new Date(dateDebut + 'T00:00:00Z');
          const endDate = new Date(dateFin + 'T00:00:00Z');
          if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) throw new Error("Dates invalides");
          if (startDate > endDate) throw new Error("La date de fin doit être après la date de début.");

          const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
          if (diffDays < 1) throw new Error("La période doit contenir au moins un jour.");

          stayDates = generateStayDates(dateDebut, diffDays);

     } catch (e) {
         showAppMessage('suivi-global-message-area', `Erreur dates: ${e.message}`, 'error');
         hideResult('suivi-result-container'); // Hide loading and container
         return;
     }

     const baseRatesExist = getBaseRates().size > 0;
     const travcoRatesExist = getTravcoBaseRates().size > 0;

     if (!baseRatesExist && !travcoRatesExist) {
          showAppMessage('suivi-global-message-area', "Données de tarifs indisponibles. Veuillez recharger la page.", "error");
          hideResult('suivi-result-container'); // Hide loading and container
          return;
     }

     const comparisonData = [];
     let missingRateWarning = false;
     let firstMissingDate = null;

     const baseRates = getBaseRates();
     const travcoRates = getTravcoBaseRates();


     for (const date of stayDates) {
         const dateStr = formatDateLocale(date);
         const dailyRates = { date: date, dateStr: dateStr, rates: [], baseRateInfo: {} };

         const baseRateValueOTA = baseRates.get(formatDateYYYYMMDD(date));
         const baseRateValueTravco = travcoRates.get(formatDateYYYYMMDD(date));

         if (baseRateValueOTA !== undefined) {
              dailyRates.baseRateInfo = { source: 'OTA', value: baseRateValueOTA };
         } else if (baseRateValueTravco !== undefined) {
              dailyRates.baseRateInfo = { source: 'Travco', value: baseRateValueTravco };
         } else {
              dailyRates.baseRateInfo = { source: 'N/A', value: null };
         }


         comparisonItems.forEach(item => {
             const dailyRate = calculateDailyRate(date, categorie, item.plan);

             if (dailyRate === null) {
                 missingRateWarning = true;
                 if (!firstMissingDate) firstMissingDate = dateStr;
                 dailyRates.rates.push({ ...item, rate: null });
             } else {
                 dailyRates.rates.push({ ...item, rate: dailyRate });
             }
         });
         comparisonData.push(dailyRates);
     }

     if (missingRateWarning) {
          showAppMessage('suivi-global-message-area', `Attention: Tarif base manquant pour certaines dates. Les tarifs dépendant de cette base pour ces jours sont affichés comme N/A.`, "warning", 10000);
     }

     // Remove loading indicator AFTER calculations
     const loadingIndicatorElement = resultContainer.querySelector('.loading-indicator');
     if (loadingIndicatorElement) { loadingIndicatorElement.remove(); }


     if (comparisonData.length > 0 && comparisonData.some(day => day.rates.some(r => r.rate !== null))) {
         // --- AFFICHAGE DES RESULTATS ---
         // Populate the result container with the necessary HTML structure
         resultContainer.innerHTML = `
             <h2 class="text-xl font-semibold mb-6 text-light-orange highlight-orange">
                  <i class="fas fa-chart-bar mr-2 text-gray-400"></i>Résultats de la Comparaison
             </h2>
             <div class="mb-8">
                 <h3 class="text-lg font-medium mb-4 text-light-orange">Graphique des Tarifs Journaliers</h3>
                 <div class="chart-container">
                     <canvas id="tarifsChart"></canvas>
                 </div>
             </div>
             <div class="mb-8">
                 <h3 class="text-lg font-medium mb-4 text-light-orange">Analyse des Différences</h3>
                 <div id="suivi-differenceAnalysis" class="space-y-6"></div>
             </div>
             <div class="mb-8">
                 <h3 class="text-lg font-medium mb-4 text-light-orange">Tableau Comparatif Journalier</h3>
                 <div id="suivi-comparisonTable" class="overflow-x-auto"></div>
                  <div class="mt-4 text-sm text-gray-400">
                     <i class="fas fa-info-circle mr-1"></i>
                     Les couleurs dans le tableau indiquent les tarifs les plus bas (<span class="text-accent-green">vert</span>) et les plus élevés (<span class="text-accent-red">rouge</span>) pour chaque jour.
                 </div>
             </div>
              <div id="suivi-alertContainer" class="mt-6"></div> <!-- Alert container moved here -->
         `;
         // The container was already made visible by showLoading

         // Now that the elements exist in the DOM, generate/update them
         generateChart(comparisonData, chartType, comparisonItems);
         updateComparisonTable(comparisonData, comparisonItems);
         updateDifferenceAnalysis(comparisonData, comparisonItems, dateDebut, dateFin, categorie);

          resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
         showAppMessage('suivi-global-message-area', 'Comparaison générée avec succès.', 'success', 5000);

     } else {
         showAppMessage('suivi-global-message-area', "Aucune donnée calculable pour la comparaison. Vérifiez la période, la catégorie et si les tarifs de base sont disponibles.", "warning", 0);
          hideResult('suivi-result-container'); // Hide container completely if no data
     }
}


function generateChart(data, chartType, comparisonItems) {
     // Now getContext is called after the canvas element has been added to the DOM and made visible
     const ctx = document.getElementById('tarifsChart')?.getContext('2d');
     if (!ctx) { console.error("SUIVI: Impossible d'obtenir le contexte 2D du canvas pour Chart.js."); return; } // Log plus précis

     if (tarifsChart) {
         tarifsChart.destroy();
     }

     const labels = data.map(day => day.dateStr);
     const datasets = comparisonItems.map((item, index) => {
         const rates = data.map(day => {
              const rateEntry = day.rates.find(r => r.partner === item.partner && r.plan === item.plan);
              return rateEntry ? rateEntry.rate : null;
         });
         const color = getDatasetColor(index);

         return {
             label: `${item.partner} (${item.plan})`,
             data: rates,
             borderColor: color,
             backgroundColor: chartType === 'area' ? color + '40' : color,
             borderWidth: 2,
             tension: chartType === 'line' || chartType === 'area' ? 0.1 : 0,
             fill: chartType === 'area' ? 'origin' : false,
             pointRadius: 3,
             pointHoverRadius: 5,
             spanGaps: true
         };
     });

     tarifsChart = new Chart(ctx, {
         type: chartType === 'area' ? 'line' : chartType,
         data: { labels, datasets },
         options: {
             responsive: true,
             maintainAspectRatio: false,
             plugins: {
                 legend: {
                     position: 'top',
                     labels: { color: '#e2e8f0', font: { size: 14 } }
                 },
                 tooltip: {
                     mode: 'index',
                     intersect: false,
                     backgroundColor: 'rgba(30, 41, 59, 0.9)',
                     titleColor: '#f97316',
                     bodyColor: '#e2e8f0',
                     borderColor: '#4a5568',
                     borderWidth: 1,
                     caretPadding: 10,
                     callbacks: {
                          label: context => {
                               const label = context.dataset.label || '';
                               if (context.parsed.y !== null && !isNaN(context.parsed.y)) {
                                    return `${label}: ${context.parsed.y.toFixed(2)} €`;
                               }
                               return `${label}: N/A`;
                          },
                          title: context => context.length > 0 ? context[0].label : ''
                     }
                 }
             },
             scales: {
                 x: {
                     grid: { color: '#4a5568' },
                     ticks: { color: '#94a3b8' }
                 },
                 y: {
                     grid: { color: '#4a5568' },
                     ticks: {
                         color: '#94a3b8',
                         callback: value => {
                             if (typeof value === 'number' && isFinite(value)) {
                                 return `${value} €`;
                             }
                             return 'N/A';
                         }
                     },
                     beginAtZero: true
                 }
             }
         }
     });
 }


function updateComparisonTable(data, comparisonItems) {
     const comparisonDiv = document.getElementById('suivi-comparisonTable');
     if (!comparisonDiv) { console.error("SUIVI: Élément #suivi-comparisonTable introuvable."); return; }

     let headerCells = `<th class="px-4 py-3 text-end text-sm">Tarif Base<br><span class="text-xs normal-case">Absolu</span></th>`;
     headerCells += comparisonItems.map(item => `<th class="px-4 py-3 text-left text-sm">${item.partner} (${item.plan})</th>`).join('');


     let rows = data.map(day => {
         const validRates = day.rates.map(r => r.rate).filter(rate => rate !== null);
         const minRate = validRates.length > 0 ? Math.min(...validRates) : null;
         const maxRate = validRates.length > 0 ? Math.max(...validRates) : null;

         let baseRateText = '<span class="italic text-xs text-gray-500">N/A</span>';
         let baseRateTitle = 'Tarif base non disponible';
         if (day.baseRateInfo && day.baseRateInfo.value !== null) {
              baseRateText = day.baseRateInfo.value.toFixed(2) + '€';
              baseRateTitle = `Tarif Base ${day.baseRateInfo.source}`;
         }
         let baseRateCell = `<td class="px-4 py-3 text-end text-sm text-gray-400" title="${baseRateTitle}">${baseRateText}</td>`;


         let rowCells = day.rates.map(rateInfo => {
             let cellClass = 'px-4 py-3 text-right font-mono';
             let cellContent = rateInfo.rate !== null ? `${rateInfo.rate.toFixed(2)} €` : '<span class="italic text-xs text-gray-500">N/A</span>';

             if (rateInfo.rate !== null) {
                 if (validRates.length > 1) {
                     if (rateInfo.rate === minRate) {
                         cellClass += ' text-accent-green font-semibold';
                     } else if (rateInfo.rate === maxRate) {
                         cellClass += ' text-accent-red font-semibold';
                     }
                 }
             }

             return `<td class="${cellClass}">${cellContent}</td>`;
         }).join('');

         return `
             <tr class="border-b border-gray-700">
                 <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-300">${day.dateStr}</td>
                 ${baseRateCell}
                 ${rowCells}
             </tr>
         `;
     }).join('');

      const totals = comparisonItems.map((item, index) => {
           return data.reduce((sum, day) => {
                const rateEntry = day.rates.find(r => r.partner === item.partner && r.plan === item.plan);
                return sum + (rateEntry && rateEntry.rate !== null ? rateEntry.rate : 0);
           }, 0);
      });
      const totalCells = totals.map(total => `<td class="px-4 py-3 text-right text-sm font-semibold font-mono">${total.toFixed(2)} €</td>`).join('');


     comparisonDiv.innerHTML = `
         <table class="min-w-full divide-y divide-gray-700 table">
             <thead class="bg-darker-charcoal text-light-orange">
                 <tr>
                     <th class="px-4 py-3 text-left text-sm">Date</th>
                     ${headerCells}
                 </tr>
             </thead>
             <tbody class="divide-y divide-gray-700 bg-charcoal-dark/40">
                 ${rows}
             </tbody>
             <tfoot class="bg-darker-charcoal/80 font-semibold text-gray-100">
                 <tr class="border-t-2 border-gray-600">
                      <td class="px-4 py-3 text-sm text-left" colspan="2">Total Période</td>
                      ${totalCells}
                 </tr>
              </tfoot>
         </table>
     `;
 }


function updateDifferenceAnalysis(data, comparisonItems, dateDebutStr, dateFinStr, categorie) {
     const analysisDiv = document.getElementById('suivi-differenceAnalysis');
     if (!analysisDiv) { console.error("SUIVI: Élément #suivi-differenceAnalysis introuvable."); return; }

     analysisDiv.innerHTML = '';

     if (data.length === 0 || comparisonItems.length === 0 || !data.some(day => day.rates.some(r => r.rate !== null))) {
         analysisDiv.innerHTML = '<p class="text-gray-400">Aucune donnée calculable pour l\'analyse.</p>';
         return;
     }

     const itemStats = comparisonItems.map(item => {
         const rates = data.map(day => {
              const rateEntry = day.rates.find(r => r.partner === item.partner && r.plan === item.plan);
              return rateEntry ? rateEntry.rate : null;
         }).filter(rate => rate !== null);

         if (rates.length === 0) {
              return { ...item, hasData: false };
         }

         const sum = rates.reduce((total, rate) => total + rate, 0);
         const average = sum / rates.length;
         const minRate = Math.min(...rates);
         const maxRate = Math.max(...rates);

          const minDates = data.filter(day => {
               const rateEntry = day.rates.find(r => r.partner === item.partner && r.plan === item.plan);
               return rateEntry && rateEntry.rate !== null && rateEntry.rate === minRate;
          }).map(day => day.dateStr);

          const maxDates = data.filter(day => {
               const rateEntry = day.rates.find(r => r.partner === item.partner && r.plan === item.plan);
                return rateEntry && rateEntry.rate !== null && rateEntry.rate === maxRate;
          }).map(day => day.dateStr);


         return {
             ...item,
             hasData: true,
             average: average,
             minRate: minRate,
             maxRate: maxRate,
             minDates: minDates,
             maxDates: maxDates,
             validDaysCount: rates.length
         };
     });

     const analysisHtml = itemStats.map(stats => {
          if (!stats.hasData) {
               return `
                   <div class="bg-darker-charcoal/30 rounded-lg p-4 shadow border border-gray-700/50">
                       <h5 class="font-medium mb-2 text-light-orange">${stats.partner} (${stats.plan})</h5>
                       <p class="text-gray-400 text-sm italic">Pas de données calculables disponibles pour cette combinaison Partenaire/Plan sur la période.</p>
                   </div>
               `;
          }

         const dateDebutLocale = formatDateLocale(new Date(dateDebutStr + 'T00:00:00Z'));
         const dateFinLocale = formatDateLocale(new Date(dateFinStr + 'T00:00:00Z'));

         return `
             <div class="bg-darker-charcoal/30 rounded-lg p-4 shadow border border-gray-700/50">
                 <h5 class="font-medium mb-2 text-light-orange">${stats.partner} (<span class="text-gray-300">${stats.plan}</span>)</h5>
                 <p class="text-gray-300 text-sm">
                     Pour une chambre <span class="font-semibold">${categorie}</span> entre le ${dateDebutLocale} et le ${dateFinLocale} (${stats.validDaysCount} jour${stats.validDaysCount > 1 ? 's' : ''} calculé${stats.validDaysCount > 1 ? 's' : ''}) :
                 </p>
                 <ul class="text-gray-400 text-sm mt-2 space-y-1">
                     <li>Tarif moyen : <span class="font-semibold text-gray-100">${stats.average.toFixed(2)} €</span></li>
                     <li>Tarif le plus bas : <span class="font-semibold text-accent-green">${stats.minRate.toFixed(2)} €</span> (le${stats.minDates.length > 1 ? 's' : ''} ${stats.minDates.join(', ')})</li>
                     <li>Tarif le plus haut : <span class="font-semibold text-accent-red">${stats.maxRate.toFixed(2)} €</span> (le${stats.maxDates.length > 1 ? 's' : ''} ${stats.maxDates.join(', ')})</li>
                 </ul>
             </div>
         `;
     }).join('');

     analysisDiv.innerHTML = analysisHtml;
 }


function getDatasetColor(index) {
    const colors = [
        '#f97316', // vibrant-orange
        '#3b82f6', // accent-blue
        '#10b981', // accent-green
        '#8b5cf6', // violet
        '#facc15', // accent-yellow
        '#ef4444', // accent-red
        '#64748b', // slate-600
        '#a3e635', // lime-400
        '#22d3ee', // cyan-400
        '#e879f9'  // fuchsia-400
    ];
    return colors[index % colors.length];
}


function resetSuiviForm() {
    console.log("SUIVI: Réinitialisation du formulaire.");
    const form = document.getElementById('suiviForm');
    if (form) {
         form.reset();
         try {
             const today = new Date();
             const oneWeekLater = new Date();
             oneWeekLater.setUTCDate(today.getUTCDate() + 7);
             document.getElementById('suivi-dateDebut').value = formatDateYYYYMMDD(today);
             document.getElementById('suivi-dateFin').value = formatDateYYYYMMDD(oneWeekLater);
         } catch(e) {console.error("SUIVI: Erreur réinitialisation dates:", e);}


         const container = document.getElementById('partnerComparisonsContainer');
         if (container) {
             const blocks = container.querySelectorAll('.partner-comparison-block');
             for (let i = blocks.length - 1; i >= 2; i--) {
                  container.removeChild(blocks[i]);
             }
             container.querySelectorAll('.partner-comparison-block').forEach((block, index) => {
                 block.querySelector('h5').textContent = `Plan de Comparaison ${index + 1}`;
                  if (index < 2) {
                       const btn = block.querySelector('.remove-btn');
                       if (btn) btn.remove();
                  }
             });
         }
         comparisonBlockCounter = 2;

         const firstTwoBlocks = container.querySelectorAll('.partner-comparison-block');
         firstTwoBlocks.forEach(block => {
              const partnerSelect = block.querySelector('.partner-select-suivi');
              const planSelect = block.querySelector('.plan-select-suivi');
              const helpTextElement = block.querySelector('.rate-plan-help-suivi');

              if (partnerSelect) {
                   partnerSelect.value = "";
              }
              if (planSelect) {
                   populateDropdown(planSelect.id, new Set(), "Sélectionnez Catégorie/Partenaire...");
                   planSelect.value = "";
                   planSelect.disabled = true;
                   updateRatePlanHelpSuivi(planSelect.value, helpTextElement);
              }
         });

         hideResult('suivi-result-container');
         document.getElementById('suivi-global-message-area').innerHTML = '';

         if (tarifsChart) {
              tarifsChart.destroy();
              tarifsChart = null;
              const chartContainer = document.querySelector('.chart-container');
              if (chartContainer) {
                   chartContainer.innerHTML = '<canvas id="tarifsChart"></canvas>';
              }
         }

         const categorySelect = document.getElementById('suivi-room-category');
         if (categorySelect) {
              categorySelect.value = "";
              updateRoomCategoryOptionsSuivi();
         }

         document.getElementById('suivi-addPartnerBtn')?.classList.remove('hidden');

          showAppMessage('suivi-global-message-area', 'Formulaire réinitialisé.', 'success', 3000);

    } else {
        console.error("SUIVI: Formulaire suiviForm introuvable pour réinitialisation.");
    }
}


// ==========================================================================
// ==                     INITIALISATION APPLICATION SUIVI                 ==
// ==========================================================================

// Cette fonction est le point d'entrée qui orchestre l'initialisation.
// Elle est définie APRÈS toutes les fonctions qu'elle appelle.
async function initializeSuiviApp() {
    console.log("SUIVI: Lancement de initializeSuiviApp...");
    // Appel des fonctions définies AVANT celle-ci
    disableSuiviForm(); // Désactive tout tant que les données ne sont pas prêtes

    // Charge les données
    const dataLoaded = await loadAppData('suivi-global-message-area');

    if (dataLoaded) {
        console.log("SUIVI: Données chargées et traitées. Activation interface.");
        // Appel des fonctions définies AVANT celle-ci, maintenant que les données sont prêtes
        initializeSuiviForm(); // Peuple les champs du formulaire initial (dates, catégories, blocs initiaux)
        setupSuiviEventListeners(); // Attache tous les listeners aux éléments du formulaire
        initializeChart(); // Initialise la variable Chart.js (mais pas le graphique lui-même)

        enableSuiviForm(); // Active les champs du formulaire pour interaction utilisateur

    } else {
        console.error("SUIVI: Échec de l'initialisation de l'application de comparaison.");
         // Le message d'erreur persistant est déjà affiché par loadAppData.
         // Le formulaire reste désactivé par disableSuiviForm.
    }
}


// Point d'entrée de l'application suivi_tarifs
document.addEventListener('DOMContentLoaded', async () => {
    console.log("SUIVI: DOM Chargé. Lancement de l'orchestrateur initializeSuiviApp...");
    initializeSuiviApp(); // Lance la séquence d'initialisation orchestrée par initializeSuiviApp
});