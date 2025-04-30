// --- START OF FILE script.js ---
import {
    loadAppData,
    getAllPartners,
    getCategoryToPlansMap,
    getPlanToCategoriesMap,
    getPartnerToPlansMap,
    getOriginalPlanOrder,
    ratePlanDescriptions,
    ABSOLUTE_BASE_CATEGORY_NAME,
    BASE_RATE_PLAN_NAME,
    TRAVCO_BASE_CATEGORY,
    TRAVCO_BASE_PLAN,
    getAllPlans,
    getBaseRates,
    getTravcoBaseRates
} from './api.js';
import { calculateDailyRate } from './calcul.js';
import {
    showAppMessage,
    showLoading,
    hideResult,
    formatDateLocale,
    formatDateYYYYMMDD,
    generateStayDates,
    getElementValue,
    getElementValueAsInt,
    getElementValueAsFloat,
    populateDropdown
} from './utils.js';

console.log("script.js module loaded.");


// --- Activation/Désactivation des formulaires (Spécifiques à Index) ---
function disableFormsIndex() {
    console.log("INDEX: Désactivation des formulaires et de la section choix.");
    ['calculate', 'verify'].forEach(prefix => {
        const form = document.getElementById(`${prefix}-form`);
        if (form) {
            form.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
        }
        hideResult(`${prefix}-result`);
    });
    const choiceSection = document.getElementById('choice-section');
    if (choiceSection) {
        choiceSection.style.opacity = '0.5';
        choiceSection.style.pointerEvents = 'none';
    }
}

function enableFormsIndex() {
   console.log("INDEX: Activation des formulaires et peuplement initial...");
   ['calculate', 'verify'].forEach(prefix => {
       const form = document.getElementById(`${prefix}-form`);
       if (form) {
            console.log(`INDEX: Activation formulaire: ${prefix}-form`);
            form.querySelectorAll('input[type="date"], input[type="number"], button').forEach(el => el.disabled = false);

            // Initial population of Partner dropdown
            console.log(`INDEX: Populating partner dropdown for ${prefix}`);
            updatePartnerOptions(prefix);

            // Initialisation/désactivation des selects dépendants
             const categorySelect = document.getElementById(`${prefix}-room-category`);
             if (categorySelect) {
                  populateDropdown(`${prefix}-room-category`, new Set(), "Sélectionnez Plan...");
                  categorySelect.value = "";
                  categorySelect.disabled = true;
             }
             const ratePlanSelect = document.getElementById(`${prefix}-rate-plan`);
             if (ratePlanSelect) {
                  populateDropdown(`${prefix}-rate-plan`, new Set(), "Sélectionnez Partenaire...");
                  ratePlanSelect.value = "";
                  ratePlanSelect.disabled = true;
                  // FIX: Use ${prefix} instead of ${formPrefix} here
                  updateRatePlanHelpIndex("", `${prefix}-rate-plan-help`); // Corrected line
             }

            form.dataset.listenersAttached = 'false';
       } else {
           console.warn(`INDEX: Formulaire introuvable pour le préfixe: ${prefix}`);
       }
   });
   const choiceSection = document.getElementById('choice-section');
   if (choiceSection) {
       choiceSection.style.opacity = '1';
       choiceSection.style.pointerEvents = 'auto';
       console.log("INDEX: Section de choix réactivée.");
   }
}


// --- Fonctions de Mise à Jour des Dropdowns (Spécifiques à Index) ---

function updatePartnerOptions(formPrefix) {
    console.log(`INDEX.updatePartnerOptions(${formPrefix})`);
    populateDropdown(`${formPrefix}-partner`, getAllPartners(), 'Sélectionnez Partenaire...', true, "", "Tous les partenaires");
}

function updateCategoryOptions(formPrefix) {
    console.log(`INDEX.updateCategoryOptions(${formPrefix})`);
    const partnerSelectId = `${formPrefix}-partner`;
    const categorySelectId = `${formPrefix}-room-category`;
    const planSelectId = `${formPrefix}-rate-plan`;

    const selectedPartner = getElementValue(partnerSelectId);
    const selectedPlan = getElementValue(planSelectId);

    let placeholder = "Sélectionnez Catégorie...";
    let optionsToPopulate = new Set();

    if (!selectedPlan) {
        placeholder = "Sélectionnez un Plan...";
        optionsToPopulate = new Set();
    } else {
        const planToCategories = getPlanToCategoriesMap();
        const plansForPartnerMap = getPartnerToPlansMap();
        const categoriesForPlan = planToCategories.get(selectedPlan) || new Set();

        if (selectedPartner === "" || !selectedPartner) {
            optionsToPopulate = categoriesForPlan;
        } else {
             if (plansForPartnerMap.get(selectedPartner)?.has(selectedPlan)) {
                  optionsToPopulate = categoriesForPlan;
             } else {
                  console.warn(`INDEX.updateCategoryOptions(${formPrefix}): Incohérence Plan/Partenaire: Plan '${selectedPlan}' not associated with partner '${selectedPartner}'.`);
                  optionsToPopulate = new Set();
                  placeholder = "Incohérence Plan/Partenaire";
             }
        }
        if (optionsToPopulate.size === 0) {
            placeholder = `Aucune catégorie pour le plan ${selectedPlan}`;
        }
    }
    console.log(`INDEX.updateCategoryOptions(${formPrefix}): Populating category select with ${optionsToPopulate.size} options.`);
    populateDropdown(categorySelectId, optionsToPopulate, placeholder);
    const categorySelect = document.getElementById(categorySelectId);
    if (categorySelect) {
        categorySelect.disabled = optionsToPopulate.size === 0;
         if (optionsToPopulate.size > 0 && !categorySelect.value) {
             if (categorySelect.options.length > 1 && categorySelect.options[1].value !== "") {
                 categorySelect.selectedIndex = 1;
                 console.log(`INDEX.updateCategoryOptions(${formPrefix}): Auto-selected category: ${categorySelect.value}`);
             }
         }
    }
}

function updateRatePlanOptions(formPrefix) {
    console.log(`INDEX.updateRatePlanOptions(${formPrefix})`);
    const partnerSelectId = `${formPrefix}-partner`;
    const ratePlanSelectId = `${formPrefix}-rate-plan`;

    const selectedPartner = getElementValue(partnerSelectId);

    let placeholder = "Sélectionnez Plan...";
    let optionsToPopulate = new Set();
    let orderSourceCategory = null;

    const allKnownPlans = getAllPlans();
    const plansForPartnerMap = getPartnerToPlansMap();
    const originalPlanOrderMap = getOriginalPlanOrder();

    if (selectedPartner === "" || !selectedPartner) {
        optionsToPopulate = allKnownPlans;
        placeholder = "Sélectionnez Partenaire...";
        orderSourceCategory = ABSOLUTE_BASE_CATEGORY_NAME;

    } else {
        optionsToPopulate = plansForPartnerMap.get(selectedPartner) || new Set();
        placeholder = "Sélectionnez Plan...";
        orderSourceCategory = ABSOLUTE_BASE_CATEGORY_NAME;
         if (optionsToPopulate.size === 0) {
              placeholder = `Aucun plan pour ce partenaire (${selectedPartner})`;
         }
    }

    let orderedPlans = [];
    if (orderSourceCategory && originalPlanOrderMap[orderSourceCategory]) {
        orderedPlans = originalPlanOrderMap[orderSourceCategory].filter(plan => optionsToPopulate.has(plan));
        const remainingPlans = [...optionsToPopulate].filter(plan => !orderedPlans.includes(plan));
        remainingPlans.sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
        orderedPlans = [...orderedPlans, ...remainingPlans];
         console.log(`INDEX.updateRatePlanOptions(${formPrefix}): Tri plans basé sur ordre catégorie '${orderSourceCategory}'.`);
    } else {
        orderedPlans = [...optionsToPopulate].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
         console.log(`INDEX.updateRatePlanOptions(${formPrefix}): Tri plans en mode fallback (alphabétique).`);
    }

    console.log(`INDEX.updateRatePlanOptions(${formPrefix}): Populating rate plan select with ${orderedPlans.length} options.`);
    populateDropdown(ratePlanSelectId, new Set(orderedPlans), placeholder);
    const ratePlanSelect = document.getElementById(ratePlanSelectId);
    if (ratePlanSelect) {
        ratePlanSelect.disabled = orderedPlans.length === 0;
        updateRatePlanHelpIndex(ratePlanSelect.value, `${formPrefix}-rate-plan-help`);
    }

    const categorySelect = document.getElementById(`${formPrefix}-room-category`);
    if (categorySelect) {
        console.log(`INDEX.updateRatePlanOptions(${formPrefix}): Resetting category select.`);
        populateDropdown(`${formPrefix}-room-category`, new Set(), "Sélectionnez Plan...");
        categorySelect.value = "";
        categorySelect.disabled = true;
    }
}

function updateRatePlanHelpIndex(planCode, helpTextId) {
    const helpTextElement = document.getElementById(helpTextId);
    if (helpTextElement) {
        const description = ratePlanDescriptions[planCode];
        helpTextElement.textContent = description || (planCode ? '' : '');
    }
}


// --- Fonctions de Calcul Global (calculateDetailedCost pour Index) ---

async function calculateDetailedCost(formData) {
    console.log(`INDEX.calculateDetailedCost(${formData.formPrefix})`);
    const resultDivId = `${formData.formPrefix}-result`;
    showLoading(resultDivId, "Calcul en cours...");

    let stayDates;
    try {
        stayDates = generateStayDates(formData.arrivalDate, formData.nights);
    } catch (e) {
        showAppMessage('global-message-area', `Erreur dates: ${e.message}`, 'error');
        hideResult(resultDivId);
        return null;
    }

    let subtotal = 0;
    const dailyRatesDetails = [];
    let missingRateWarning = false;
    let firstMissingDate = null;

    const baseRates = getBaseRates();
    const travcoRates = getTravcoBaseRates();


    for (const date of stayDates) {
        const dailyRate = calculateDailyRate(date, formData.roomCategory, formData.ratePlan);


        if (dailyRate === null) {
            missingRateWarning = true;
            if (!firstMissingDate) firstMissingDate = formatDateLocale(date);
            dailyRatesDetails.push({
                date: formatDateLocale(date),
                baseRateSource: formData.ratePlan.startsWith('TRAVCO-') ? 'Travco' : 'OTA',
                baseRateValue: null,
                finalRate: 0
            });
        } else {
            subtotal += dailyRate;
             const baseRateValue = formData.ratePlan.startsWith('TRAVCO-')
                 ? travcoRates.get(formatDateYYYYMMDD(date))
                 : baseRates.get(formatDateYYYYMMDD(date));

             dailyRatesDetails.push({
                 date: formatDateLocale(date),
                 baseRateSource: formData.ratePlan.startsWith('TRAVCO-') ? 'Travco' : 'OTA',
                 baseRateValue: baseRateValue,
                 finalRate: dailyRate
             });
        }
    }

    subtotal = Math.round(subtotal * 100) / 100;
    const discountPercentage = parseFloat(formData.discount) || 0;
    const discountAmount = Math.round((subtotal * (discountPercentage / 100)) * 100) / 100;
    const finalTotal = Math.round((subtotal - discountAmount) * 100) / 100;

    if (missingRateWarning) {
        showAppMessage('global-message-area', `Attention: Tarif base manquant pour certaines dates (à partir du ${firstMissingDate}). Nuits calculées à 0€ dans le total affiché ci-dessous.`, "warning", 10000);
    }

    if (finalTotal === 0 && subtotal === 0 && !missingRateWarning && formData.nights > 0) {
        showAppMessage('global-message-area', "Avertissement: Le total résultant est 0€. Vérifiez les tarifs de base ou les formules pour ces dates.", "warning");
    }

    console.log("INDEX.calculateDetailedCost: Calculation complete", { subtotal, discountAmount, finalTotal });
    return {
        dailyRates: dailyRatesDetails,
        subtotal: subtotal,
        discountAmount: discountAmount,
        total: finalTotal,
        missingRateWarning: missingRateWarning
    };
}


// --- Fonctions d'Affichage des Résultats (Spécifiques à Index) ---

function displayCalculateResult(formData, result) {
    console.log("INDEX.displayCalculateResult", { formData, result });
    const resultDiv = document.getElementById('calculate-result');
    if (!resultDiv) { console.error("INDEX: Element 'calculate-result' introuvable."); return; }
    if (!result) { resultDiv.innerHTML = `<div class='text-red-400 p-4'>Calcul détaillé échoué.</div>`; resultDiv.classList.remove('hidden'); return; }

    let arrivalDate, departureDate;
    try {
         arrivalDate = new Date(formData.arrivalDate + 'T00:00:00Z');
         departureDate = new Date(arrivalDate);
         departureDate.setUTCDate(arrivalDate.getUTCDate() + formData.nights);
         if (isNaN(arrivalDate.getTime()) || isNaN(departureDate.getTime())) throw new Error();
    } catch (e) { showAppMessage('global-message-area', "Erreur interne: Impossible de formater les dates.", "error"); return; }

    const planDescription = ratePlanDescriptions[formData.ratePlan] || `(Description non disponible)`;
    const partnerText = formData.partner && formData.partner !== "" ? `Partenaire: ${formData.partner}` : 'Partenaire: Tous';


    const tableRows = result.dailyRates.map(rate => {
        let baseRateText = '<span class="italic text-xs text-gray-500">Manquant</span>';
        let baseRateTitle = `Tarif base ${rate.baseRateSource} manquant`;
        if (rate.baseRateValue !== null) {
            baseRateText = `${rate.baseRateValue.toFixed(2)}€`;
             baseRateTitle = `Tarif Base ${rate.baseRateSource} (Source: ${rate.baseRateSource === 'OTA' ? BASE_RATE_PLAN_NAME : TRAVCO_BASE_PLAN} / ${rate.baseRateSource === 'OTA' ? ABSOLUTE_BASE_CATEGORY_NAME : TRAVCO_BASE_CATEGORY})`;
        }
        const finalRateText = rate.finalRate !== null ? `${rate.finalRate.toFixed(2)}€` : '<span class="italic text-xs text-red-400">Erreur Calcul</span>';

        return `<tr>
                    <td class="px-3 py-2 text-sm text-gray-300">${rate.date}</td>
                    <td class="px-3 py-2 text-end text-sm text-gray-400" title="${baseRateTitle}">${baseRateText}</td>
                    <td class="px-3 py-2 text-end text-sm font-medium text-gray-100">${finalRateText}</td>
                </tr>`;
    }).join('');

    const resultHtml = `
        <h5 class="text-xl font-semibold mb-4 text-light-orange highlight-orange">Détail du calcul pour ${formData.nights} nuit(s)</h5>
        <div class="text-sm text-gray-300 mb-4 space-y-1">
            <p><i class="fas fa-calendar-alt fa-fw mr-2 text-gray-400"></i>Du ${formatDateLocale(arrivalDate)} au ${formatDateLocale(departureDate)}</p>
            <p><i class="fas fa-users fa-fw mr-2 text-gray-400"></i>${partnerText}</p>
            <p><i class="fas fa-bed fa-fw mr-2 text-gray-400"></i>Chambre: <strong>${formData.roomCategory}</strong></p>
            <p><i class="fas fa-tag fa-fw mr-2 text-gray-400"></i>Plan: <strong>${formData.ratePlan}</strong> <span class="text-xs italic text-gray-400 ml-1">${planDescription}</span></p>
        </div>
        ${result.missingRateWarning ? `<p class="alert alert-warning text-xs"><i class="fas fa-exclamation-triangle"></i> Certains tarifs de base journaliers manquaient (nuit calculée à 0€).</p>` : ''}
        <div class="overflow-x-auto rounded-md border border-gray-700 mb-5 shadow-md">
            <table class="min-w-full divide-y divide-gray-700 table">
                <caption class="caption-top text-xs text-gray-400 p-1 bg-darker-charcoal rounded-t-md">Détail par nuit</caption>
                <thead class="bg-darker-charcoal">
                    <tr>
                        <th class="th-style text-left">Date</th>
                        <th class="th-style text-end">Tarif Base Absolu<br><span class="text-xs normal-case">(Source: ${result.dailyRates[0]?.baseRateSource || 'N/A'})</span></th>
                        <th class="th-style text-end">Tarif Calculé<br><span class="text-xs normal-case">Journalier</span></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-700 bg-charcoal-dark/40">${tableRows}</tbody>
            </table>
        </div>
        <hr class="border-gray-600 my-4">
        <div class="flex justify-end text-sm">
            <div class="text-right text-gray-300 mr-4 space-y-1">
                <p>Sous-total :</p>
                ${formData.discount > 0 ? `<p>Remise (${formData.discount}%) :</p>` : ''}
                <p class="text-base font-semibold text-gray-100 mt-1">Total Calculé :</p>
            </div>
            <div class="text-right space-y-1">
                <p class="text-gray-200 font-mono">${result.subtotal.toFixed(2)}€</p>
                ${formData.discount > 0 ? `<p class="text-red-400 font-mono">-${result.discountAmount.toFixed(2)}€</p>` : ''}
                <p class="text-lg font-bold text-vibrant-orange mt-1 font-mono"><strong>${result.total.toFixed(2)}€</strong></p>
            </div>
        </div>`;
    resultDiv.innerHTML = resultHtml;
    resultDiv.classList.remove('hidden');
}

function displayVerifyResult(formData, calculatedResult) {
     console.log("INDEX.displayVerifyResult", { formData, calculatedResult });
    const resultDiv = document.getElementById('verify-result');
    if (!resultDiv) { console.error("INDEX: Element 'verify-result' introuvable."); return; }
    if (!calculatedResult) { resultDiv.innerHTML = `<div class='text-red-400 p-4'>Calcul pour vérification échoué.</div>`; resultDiv.classList.remove('hidden'); return; }

    let arrivalDate, departureDate;
    try { arrivalDate = new Date(formData.arrivalDate + 'T00:00:00Z'); departureDate = new Date(arrivalDate); departureDate.setUTCDate(arrivalDate.getUTCDate() + formData.nights); if (isNaN(arrivalDate.getTime()) || isNaN(departureDate.getTime())) throw new Error(); }
    catch (e) { showAppMessage('global-message-area', "Erreur interne: Impossible de formater les dates.", "error"); return; }

    const receivedTotalNum = getElementValueAsFloat('received-total');
    let difference = NaN; let isEqual = false;
    if (receivedTotalNum !== null && !isNaN(receivedTotalNum)) {
        difference = Math.abs(calculatedResult.total - receivedTotalNum);
        isEqual = difference < 0.01;
    }

    const planDescription = ratePlanDescriptions[formData.ratePlan] || `(Description N/A)`;
    const partnerText = formData.partner && formData.partner !== "" ? `Partenaire: ${formData.partner}` : 'Partenaire: Tous';

    let alertClass = 'alert-error'; let alertIcon = 'fa-exclamation-triangle'; let alertTitle = 'ERREUR'; let alertMessage = 'Total reçu invalide.';
    if (receivedTotalNum !== null && !isNaN(receivedTotalNum)) {
         alertClass = isEqual ? 'alert-success' : 'alert-warning';
         alertIcon = isEqual ? 'fa-check-circle' : 'fa-exclamation-triangle';
         alertTitle = isEqual ? 'CONCORDANCE OK' : 'ÉCART DÉTECTÉ';
         alertMessage = isEqual ? '' : `<span class="text-sm">(Différence : ${difference.toFixed(2)}€)</span>`;
    }

    const alertHtml = `<div class="alert ${alertClass} text-base mb-4 shadow-lg"><i class="fas ${alertIcon} text-xl"></i><div class="ml-3"><span class="font-semibold block">${alertTitle}</span>${alertMessage}</div></div>`;

    const tableRows = calculatedResult.dailyRates.map(rate => {
        let baseRateText = '<span class="italic text-xs text-gray-500">Manquant</span>';
        let baseRateTitle = `Tarif base ${rate.baseRateSource} manquant`;
        if (rate.baseRateValue !== null) {
            baseRateText = `${rate.baseRateValue.toFixed(2)}€`;
             baseRateTitle = `Tarif Base ${rate.baseRateSource} (Source: ${rate.baseRateSource === 'OTA' ? BASE_RATE_PLAN_NAME : TRAVCO_BASE_PLAN} / ${rate.baseRateSource === 'OTA' ? ABSOLUTE_BASE_CATEGORY_NAME : TRAVCO_BASE_CATEGORY})`;
        }
         const finalRateText = rate.finalRate !== null ? `${rate.finalRate.toFixed(2)}€` : '<span class="italic text-xs text-red-400">Erreur</span>';
        return `<tr>
                    <td class="px-3 py-2 text-sm text-gray-300">${rate.date}</td>
                    <td class="px-3 py-2 text-end text-sm text-gray-400" title="${baseRateTitle}">${baseRateText}</td>
                    <td class="px-3 py-2 text-end text-sm font-medium text-gray-100">${finalRateText}</td>
                </tr>`;
    }).join('');

    const resultHtml = `
        <h5 class="text-xl font-semibold mb-3 text-light-orange highlight-orange">Résultat de la Vérification</h5>
        ${alertHtml}
        <div class="text-sm text-gray-300 mb-4 space-y-1">
            <p><i class="fas fa-calendar-alt fa-fw mr-2 text-gray-400"></i>Du ${formatDateLocale(arrivalDate)} au ${formatDateLocale(departureDate)} (${formData.nights} nuit(s))</p>
            <p><i class="fas fa-users fa-fw mr-2 text-gray-400"></i>${partnerText}</p>
            <p><i class="fas fa-bed fa-fw mr-2 text-gray-400"></i>Chambre: <strong>${formData.roomCategory}</strong></p>
            <p><i class="fas fa-tag fa-fw mr-2 text-gray-400"></i>Plan: <strong>${formData.ratePlan}</strong> <span class="text-xs italic text-gray-400 ml-1">${planDescription}</span> | Remise: ${formData.discount}%</p>
        </div>
        ${calculatedResult.missingRateWarning ? `<p class="alert alert-warning text-xs"><i class="fas fa-exclamation-triangle"></i> Certains tarifs de base manquaient (calcul système à 0€ pour ces nuits).</p>` : ''}
        <div class="overflow-x-auto rounded-md border border-gray-700 mb-5 shadow-md">
             <table class="min-w-full divide-y divide-gray-700 table">
                <caption class="caption-top text-xs text-gray-400 p-1 bg-darker-charcoal rounded-t-md">Détail du calcul système</caption>
                <thead class="bg-darker-charcoal">
                    <tr>
                        <th class="th-style text-left">Date</th>
                         <th class="th-style text-end">Tarif Base Absolu<br><span class="text-xs normal-case">(Source: ${calculatedResult.dailyRates[0]?.baseRateSource || 'N/A'})</span></th>
                        <th class="th-style text-end">Tarif Calculé<br><span class="text-xs normal-case">Journalier</span></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-700 bg-charcoal-dark/40">${tableRows}</tbody>
            </table>
        </div>
        <hr class="border-gray-600 my-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div class="bg-darker-charcoal/30 p-3 rounded border border-gray-700/50">
                <p class="font-medium text-gray-200 mb-2">Récapitulatif Calcul Système :</p>
                <div class="space-y-1 text-gray-300">
                    <p>Sous-total: <span class="float-right font-mono">${calculatedResult.subtotal.toFixed(2)}€</span></p>
                    ${formData.discount > 0 ? `<p>Remise (${formData.discount}%): <span class="float-right font-mono text-red-400">-${calculatedResult.discountAmount.toFixed(2)}€</span></p>` : ''}
                    <p class="font-semibold text-gray-100 pt-1 border-t border-gray-600/50 mt-1">Total Calculé: <strong class="text-lg float-right font-mono">${calculatedResult.total.toFixed(2)}€</strong></p>
                </div>
            </div>
            <div class="bg-darker-charcoal/30 p-3 rounded border border-gray-700/50">
                <p class="font-medium text-gray-200 mb-2">Comparaison :</p>
                <div class="space-y-1 text-gray-300">
                    <p class="font-semibold text-gray-100">Total Reçu Indiqué: <strong class="text-lg float-right font-mono">${receivedTotalNum !== null ? receivedTotalNum.toFixed(2) + '€' : 'N/A'}</strong></p>
                </div>
            </div>
        </div>`;
    resultDiv.innerHTML = resultHtml;
    resultDiv.classList.remove('hidden');
}


// --- Validation de Formulaire (Spécifique à Index) ---
function validateFormIndex(formData, mode) {
    const errors = [];
    // Champs communs
    if (!formData.arrivalDate) { errors.push("Date d'arrivée requise."); }
    else { try { const d = new Date(formData.arrivalDate + 'T00:00:00Z'); if (isNaN(d.getTime())) errors.push("Date d'arrivée invalide."); } catch (e) { errors.push("Format date arrivée incorrect."); } }
    if (!formData.nights || isNaN(formData.nights) || formData.nights < 1 || formData.nights > 90) { errors.push('Nombre de nuits valide (1-90) requis.'); }
    if (!formData.roomCategory) { errors.push('Catégorie de chambre requise.'); }

    // Champs spécifiques
    if (mode === 'calculate' || mode === 'verify') {
        if (!formData.ratePlan) { errors.push('Plan tarifaire requis.'); }
        const discount = parseFloat(formData.discount) || 0; // Ensure discount is treated as float
        if (discount === null || isNaN(discount) || discount < 0 || discount > 100) { errors.push('Remise invalide (nombre 0-100 requis).'); }
    }
    if (mode === 'verify') {
        const receivedTotal = getElementValueAsFloat('received-total');
        if (receivedTotal === null || isNaN(receivedTotal) || receivedTotal < 0) { errors.push('Total reçu valide (nombre >= 0) requis.'); }
    }
    return { isValid: errors.length === 0, errors: errors };
}

// --- Initialisation et Écouteurs d'Événements ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("INDEX: DOM Chargé. Initialisation de l'application principale...");
    const choiceSection = document.getElementById('choice-section');
    const calculateSection = document.getElementById('calculate-section');
    const verifySection = document.getElementById('verify-section');
    const sections = [calculateSection, verifySection];

    if (!choiceSection || sections.some(s => !s)) {
        console.error("INDEX: ERREUR FATALE: Elements HTML principaux manquants !");
        showAppMessage('global-message-area', "Erreur critique: Interface non initialisable. Vérifiez la console (F12).", "error", 0);
        return;
    }

    // --- Mise à jour date par défaut ---
    try {
        const today = new Date(); const yyyy = today.getFullYear(); const mm = String(today.getMonth() + 1).padStart(2, '0'); const dd = String(today.getDate()).padStart(2, '0'); const todayStr = `${yyyy}-${mm}-${dd}`;
        ['calculate-arrival-date', 'verify-arrival-date'].forEach(id => {
            const input = document.getElementById(id); if (input) input.value = todayStr;
        });
    } catch (e) { console.error("INDEX: Erreur mise à jour date défaut:", e); }

    // --- Désactive tout au départ ---
    disableFormsIndex();

    // --- Chargement des données initiales via API module ---
    const dataLoaded = await loadAppData('global-message-area');

    if (dataLoaded) {
        console.log("INDEX: Données chargées et traitées. Activation interface.");
        enableFormsIndex();
        setupFormListeners('calculate');
        setupFormListeners('verify');
        setupChoiceListenersIndex();
        setupBackButtonsIndex();
    } else {
         console.log("INDEX: Échec du chargement initial des données. Interface désactivée.");
    }
});


// --- Setup des Listeners (spécifique à Index) ---

function setupChoiceListenersIndex() {
     const choiceSection = document.getElementById('choice-section');
     const calculateSection = document.getElementById('calculate-section');
     const verifySection = document.getElementById('verify-section');
     const sections = [calculateSection, verifySection];

     document.querySelectorAll('.choice-card').forEach(card => {
        if (card.tagName === 'DIV' && card.getAttribute('data-target')) {
             card.addEventListener('click', () => {
                const targetSectionId = card.getAttribute('data-target');
                const targetSection = document.getElementById(targetSectionId);

                if (targetSection && choiceSection) {
                    console.log(`INDEX: Affichage section: ${targetSectionId}`);
                    choiceSection.classList.add('hidden');
                    sections.forEach(section => section.classList.add('hidden'));
                    targetSection.classList.remove('hidden');
                    hideResult('calculate-result');
                    hideResult('verify-result');
                } else {
                    console.error(`INDEX: Cible interne invalide ou non trouvée pour la carte cliquée: ${targetSectionId}`);
                    showAppMessage('global-message-area', "Erreur: Impossible d'afficher la section demandée.", "error");
                }
             });
        }
    });
}

function setupBackButtonsIndex() {
     const choiceSection = document.getElementById('choice-section');
     const calculateSection = document.getElementById('calculate-section');
     const verifySection = document.getElementById('verify-section');
     const sections = [calculateSection, verifySection];

     document.querySelectorAll('.btn-back').forEach(btn => {
        btn.addEventListener('click', () => {
            console.log("INDEX: Clic sur bouton Retour");
            if (choiceSection) choiceSection.classList.remove('hidden');
            sections.forEach(section => section.classList.add('hidden'));
            hideResult('calculate-result');
            hideResult('verify-result');
        });
    });
}

function setupFormListeners(formPrefix) {
    if (formPrefix !== 'calculate' && formPrefix !== 'verify') {
        console.warn(`INDEX: setupFormListeners appelé avec un préfixe non géré par ce script: ${formPrefix}`);
        return;
    }
    console.log(`INDEX: Attachement listeners pour préfixe: ${formPrefix}`);
    const formElement = document.getElementById(`${formPrefix}-form`);

    if (!formElement || formElement.dataset.listenersAttached === 'true') {
        console.warn(`INDEX: Listeners déjà attachés ou formulaire non trouvé pour ${formPrefix}. Skipping.`);
        return;
    }

    const partnerSelect = document.getElementById(`${formPrefix}-partner`);
    const categorySelect = document.getElementById(`${formPrefix}-room-category`);
    const ratePlanSelect = document.getElementById(`${formPrefix}-rate-plan`);


    // --- Listener Partenaire ---
    partnerSelect?.addEventListener('change', () => {
        console.log(`INDEX: Listener ${formPrefix}-partner changed to ${partnerSelect.value}`);
        updateRatePlanOptions(formPrefix);
        if (ratePlanSelect) {
             ratePlanSelect.value = "";
             updateRatePlanHelpIndex(ratePlanSelect.value, `${formPrefix}-rate-plan-help`);
        }
        if (categorySelect) {
             populateDropdown(`${formPrefix}-room-category`, new Set(), "Sélectionnez Plan...");
             categorySelect.value = "";
             categorySelect.disabled = true;
        }
    });

    // --- Listener Catégorie ---
    categorySelect?.addEventListener('change', () => {
        console.log(`INDEX: Listener ${formPrefix}-room-category changed to ${categorySelect.value}`);
        // Category change does not affect Plan options in this form structure
    });

    // --- Listener Plan Tarifaire (pour Calcul/Vérif) ---
    ratePlanSelect?.addEventListener('change', (e) => {
        console.log(`INDEX: Listener ${formPrefix}-rate-plan changed to ${e.target.value}`);
        updateCategoryOptions(formPrefix);
        if (categorySelect) categorySelect.value = "";
        updateRatePlanHelpIndex(e.target.value, `${formPrefix}-rate-plan-help`);
    });


     // --- Listener Soumission Formulaire ---
     formElement.addEventListener('submit', async (e) => {
         e.preventDefault();
         console.log(`INDEX: Formulaire ${formPrefix} submitted.`);
         const resultDivId = `${formPrefix}-result`;
         hideResult(resultDivId);
         showLoading(resultDivId, "Traitement...");

         let formData = { formPrefix: formPrefix };
         try {
             formData.arrivalDate = getElementValue(`${formPrefix}-arrival-date`);
             formData.nights = getElementValueAsInt(`${formPrefix}-nights`);
             formData.partner = getElementValue(`${formPrefix}-partner`);
             formData.roomCategory = getElementValue(`${formPrefix}-room-category`);

             formData.ratePlan = getElementValue(`${formPrefix}-rate-plan`);
             formData.discount = getElementValueAsFloat(`${formPrefix}-discount`) ?? 0;
             if (formPrefix === 'verify') {
                 formData.receivedTotal = getElementValue('received-total');
             }

             console.log(`INDEX: Validation formulaire ${formPrefix} with data:`, JSON.parse(JSON.stringify(formData)));
             const validation = validateFormIndex(formData, formPrefix);
             if (!validation.isValid) {
                 showAppMessage('global-message-area', `Erreurs Formulaire ${formPrefix.charAt(0).toUpperCase() + formPrefix.slice(1)}:\n- ${validation.errors.join('\n- ')}`, 'warning');
                 hideResult(resultDivId);
                 return;
             }

             console.log(`INDEX: Form submission ${formPrefix} validated. Executing action...`);
             let resultData = null;
             if (formPrefix === 'calculate') {
                 resultData = await calculateDetailedCost(formData);
                 if (resultData) displayCalculateResult(formData, resultData);
             } else if (formPrefix === 'verify') {
                 resultData = await calculateDetailedCost(formData);
                 if (resultData) displayVerifyResult(formData, resultData);
             }

             if (!resultData && document.querySelector(`#${resultDivId} .loading-indicator`)) {
                  hideResult(resultDivId);
                  showAppMessage('global-message-area', "Une erreur s'est produite pendant le calcul.", "error");
             }

         } catch (error) {
             console.error(`INDEX: Error during form submission ${formPrefix}:`, error);
             showAppMessage('global-message-area', `Erreur inattendue (${formPrefix}): ${error.message}`, 'error');
             hideResult(resultDivId);
         }
     });

     formElement.dataset.listenersAttached = 'true';
     console.log(`INDEX: Listeners attached for ${formPrefix}.`);
}