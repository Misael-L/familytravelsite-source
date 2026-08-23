import type { TranslationStrings } from '../types';

const dashboard: TranslationStrings = {
  'dashboard.title': 'Τα Ταξίδια μου',
  'dashboard.subtitle.loading': 'Φόρτωση των ταξιδιών...',
  'dashboard.subtitle.trips': '{count} ταξίδια ({archived} αρχειοθετημένα)',
  'dashboard.subtitle.empty': 'Ξεκινήστε το πρώτο σας ταξίδι',
  'dashboard.subtitle.activeOne': '{count} ενεργό ταξίδι',
  'dashboard.subtitle.activeMany': '{count} ενεργά ταξίδια',
  'dashboard.subtitle.archivedSuffix': ' · {count} αρχειοθετημένα',
  'dashboard.newTrip': 'Νέο Ταξίδι',
  'dashboard.gridView': 'Προβολή στοιχείων',
  'dashboard.listView': 'Προβολή λίστας',
  'dashboard.currency': 'Συνάλλαγμα',
  'dashboard.timezone': 'Ζώνες ώρας',
  'dashboard.localTime': 'Τοπική',
  'dashboard.timezoneCustomTitle': 'Προσαρμοσμένη Ζώνη ώρας',
  'dashboard.timezoneCustomLabelPlaceholder': 'Επιθετικό (προαιρετικό)',
  'dashboard.timezoneCustomTzPlaceholder': 'π.χ. Αμερική/Νέα Υόρκη',
  'dashboard.timezoneCustomAdd': 'Προσθήκη',
  'dashboard.timezoneCustomErrorEmpty': 'Εισάγετε μια ζώνη ώρας',
  'dashboard.timezoneCustomErrorInvalid': 'Μη έγκυρη ζώνη ώρας. Χρησιμοποιήστε την μορφή π.χ. Europe/Berlin',
  'dashboard.timezoneCustomErrorDuplicate': 'Έχει προστεθεί ήδη',
  'dashboard.emptyTitle': 'Δεν υπάρχουν ταξίδια ακόμη',
  'dashboard.emptyText': 'Δημιουργήστε το πρώτο σας ταξίδι και ξεκινήστε τα σχέδια!',
  'dashboard.emptyButton': 'Δημιουργία Πρώτου Ταξίδιου',
  'dashboard.nextTrip': 'Επόμενο Ταξίδι',
  'dashboard.shared': 'Κοινοποιημένο',
  'dashboard.sharedBy': 'Κοινοποιήθηκε από {name}',
  'dashboard.days': 'Ημέρες',
  'dashboard.places': 'Τόποι',
  'dashboard.members': 'Μέλη',
  'dashboard.archive': 'Αρχειοθήκευση',
  'dashboard.copyTrip': 'Αντιγραφή',
  'dashboard.copySuffix': 'αντιγραφή',
  'dashboard.restore': 'Επαναφορά',
  'dashboard.archived': 'Αρχειοθετημένο',
  'dashboard.status.ongoing': 'Τρέχων',
  'dashboard.status.today': 'Σήμερα',
  'dashboard.status.tomorrow': 'Αύριο',
  'dashboard.status.past': 'Παρελθόν',
  'dashboard.status.daysLeft': '{count} μέρες έμειναν',
  'dashboard.toast.loadError': 'Αποτυχία φόρτωσης ταξιδιών',
  'dashboard.loadErrorBanner':
    'Δεν ήταν δυνατή η σύνδεση με τον διακομιστή. Τα ταξίδια σας είναι ασφαλή — δοκιμάστε ξανά.',
  'dashboard.retry': 'Δοκιμάστε ξανά',
  'dashboard.toast.created': 'Ταξίδι δημιουργήθηκε επιτυχώς!',
  'dashboard.toast.createError': 'Αποτυχία δημιουργίας ταξιδιού',
  'dashboard.toast.updated': 'Ταξίδι ενημερώθηκε!',
  'dashboard.toast.updateError': 'Αποτυχία ενημέρωσης ταξιδιού',
  'dashboard.toast.deleted': 'Ταξίδι διαγράφηκε',
  'dashboard.toast.deleteError': 'Αποτυχία διαγραφής ταξιδιού',
  'dashboard.toast.archived': 'Ταξίδι αρχειοθετήθηκε',
  'dashboard.toast.archiveError': 'Αποτυχία αρχειοθήκευσης ταξιδιού',
  'dashboard.toast.restored': 'Ταξίδι επαναφέρθηκε',
  'dashboard.toast.restoreError': 'Αποτυχία επαναφοράς ταξιδιού',
  'dashboard.toast.copied': 'Ταξίδι αντιγράφηκε!',
  'dashboard.toast.copyError': 'Αποτυχία αντιγραφής ταξιδιού',
  'dashboard.confirm.delete': 'Διαγραφή ταξιδιού "{title}"; Όλα τα τόποι και τα σχέδια θα διαγραφούν επίσης.',
  'dashboard.confirm.copy.title': 'Αντιγραφή αυτού του ταξιδιού;',
  'dashboard.confirm.copy.willCopy': 'Θα αντιγραφεί',
  'dashboard.confirm.copy.will1': 'Μέρες, μέρη και σχέδια μέρας',
  'dashboard.confirm.copy.will2': 'Καταλύματα και κρατήσεις',
  'dashboard.confirm.copy.will3': 'Αντικείμενα budget και σειρά κατηγορίας',
  'dashboard.confirm.copy.will4': 'Λίστα πακεταρίσματος (Μη ελεγμένα)',
  'dashboard.confirm.copy.will5': 'TODOs (Μη ορισμένα & Μη ελεγμένα)',
  'dashboard.confirm.copy.will6': 'Σημειώσεις μέρας',
  'dashboard.confirm.copy.wontCopy': 'Δεν θα αντιγραφούν',
  'dashboard.confirm.copy.wont1': 'Συνεργάτες & αναθέσεις μελών',
  'dashboard.confirm.copy.wont2': 'Σημειώσεις συνεργασίας, ψηφοφορίες & μηνύματα',
  'dashboard.confirm.copy.wont3': 'Αρχεία & φωτογραφίες',
  'dashboard.confirm.copy.wont4': 'Σύνδεσμοι διαμοιρασμού',
  'dashboard.confirm.copy.confirm': 'Αντιγραφή ταξιδιού',
  'dashboard.confirm.copy.family.will1': "Ημερομηνίες, εικόνα εξωφύλλου και σημειώσεις",
  'dashboard.confirm.copy.family.will2': "Χώρες και μέρη",
  'dashboard.confirm.copy.family.will3': "Ταξιδιώτες",
  'dashboard.confirm.copy.family.will4': "Περίσταση και προτίμηση υπενθύμισης",
  'dashboard.confirm.copy.family.wont1': "Πλάνο, κρατήσεις, κόστος, σημειώσεις και διαδρομές",
  'dashboard.confirm.copy.family.wont2': "Αρχεία και φωτογραφίες",
  'dashboard.confirm.copy.family.wont3': "Ψήφοι στην αρχική πρόταση (αυτό το αντίγραφο είναι νέα υποβολή)",
  'dashboard.editTrip': 'Επεξεργασία Ταξιδιού',
  'dashboard.createTrip': 'Δημιουργία Νέου Ταξιδιού',
  'dashboard.tripTitle': 'Τίτλος',
  'dashboard.tripTitlePlaceholder': 'π.χ. Καλοκαίρι στην Ιαπωνία',
  'dashboard.tripDescription': 'Περιγραφή',
  'dashboard.tripDescriptionPlaceholder': 'Σχετικά με τι είναι αυτό το ταξίδι;',
  'dashboard.startDate': 'Ημερομηνία Έναρξης',
  'dashboard.endDate': 'Ημερομηνία Λήξης',
  'dashboard.dayCount': 'Αριθμός Ημερών',
  'dashboard.dayCountHint': 'Πόσες ημέρες να σχεδιαστούν όταν δεν έχουν οριστεί ημερομηνίες ταξιδιού.',
  'dashboard.noDateHint':
    'Δεν έχει οριστεί ημερομηνία — θα δημιουργηθούν 7 προεπιλεγμένες ημέρες. Μπορείτε να το αλλάξετε οποτεδήποτε.',
  'dashboard.coverImage': 'Εικόνα Εξωφύλλου',
  'dashboard.addCoverImage': 'Προσθήκη εικόνας εξωφύλλου (ή σύρετε & αποθέστε)',
  'dashboard.addMembers': 'Συνταξιδιώτες',
  'dashboard.addMember': 'Προσθήκη μέλους',
  'dashboard.coverSaved': 'Η εικόνα εξωφύλλου αποθηκεύτηκε',
  'dashboard.coverUploadError': 'Αποτυχία μεταφόρτωσης',
  'dashboard.coverSaveError': 'Αποτυχία αποθήκευσης εικόνας εξωφύλλου',
  'dashboard.coverRemoveError': 'Αποτυχία αφαίρεσης',
  'dashboard.searchUnsplash': 'Αναζήτηση στο Unsplash',
  'dashboard.unsplashSearchPlaceholder': 'Αναζήτηση φωτογραφιών προορισμού',
  'dashboard.unsplashQueryRequired': 'Πληκτρολογήστε όρο αναζήτησης',
  'dashboard.unsplashNoResults': 'Δεν βρέθηκαν εικόνες',
  'dashboard.coverSearchError': 'Αποτυχία αναζήτησης στο Unsplash',
  'dashboard.useUnsplashPhoto': 'Χρήση φωτογραφίας Unsplash από {photographer}',
  'dashboard.titleRequired': 'Ο τίτλος είναι υποχρεωτικός',
  'dashboard.endDateError': 'Η ημερομηνία λήξης πρέπει να είναι μετά την ημερομηνία έναρξης',
  'dashboard.dateShiftTitle': 'Νέα ημερομηνία έναρξης',
  'dashboard.dateShiftIntro':
    'Αλλάξατε την ημερομηνία έναρξης αυτού του ταξιδιού. Πώς θέλετε να ακολουθήσουν τα σχέδιά σας τις νέες ημερομηνίες;',
  'dashboard.dateShiftKeepBookings': 'Διατήρηση κρατήσεων στις ημερομηνίες τους',
  'dashboard.dateShiftKeepBookingsDesc':
    'Τα σχέδια ημέρας μετακινούνται με τις νέες ημερομηνίες, ενώ οι κρατήσεις και τα καταλύματα παραμένουν στις αρχικές τους ημερομηνίες, εφόσον αυτές εξακολουθούν να ανήκουν στο ταξίδι.',
  'dashboard.dateShiftAll': 'Μετατόπιση όλων',
  'dashboard.dateShiftAllDesc':
    'Ολόκληρο το δρομολόγιο μετακινείται με τις νέες ημερομηνίες, συμπεριλαμβανομένων των κρατήσεων και των καταλυμάτων.',
  'dashboard.dateShiftHint':
    'Συμβουλή: για να μετατοπίσετε μόνο ένα μέρος του δρομολογίου σας, χρησιμοποιήστε την επιλογή "Προσθήκη ημέρας" στο ημερήσιο πλάνο.',
  'dashboard.greeting.morning': 'Καλημέρα,',
  'dashboard.greeting.afternoon': 'Καλό απόγευμα,',
  'dashboard.greeting.evening': 'Καλησπέρα,',
  'dashboard.mobile.liveNow': 'Ζωντανά Τώρα',
  'dashboard.mobile.tripProgress': 'Πρόοδος ταξιδιού',
  'dashboard.mobile.daysLeft': '{count} ημέρες ακόμα',
  'dashboard.mobile.places': 'Τοποθεσίες',
  'dashboard.mobile.buddies': 'Συνταξιδιώτες',
  'dashboard.mobile.newTrip': 'Νέο Ταξίδι',
  'dashboard.mobile.currency': 'Νόμισμα',
  'dashboard.mobile.timezone': 'Ζώνη ώρας',
  'dashboard.mobile.upcomingTrips': 'Επερχόμενα Ταξίδια',
  'dashboard.mobile.yourTrips': 'Τα Ταξίδια σας',
  'dashboard.mobile.trips': 'ταξίδια',
  'dashboard.mobile.starts': 'Ξεκινά',
  'dashboard.mobile.duration': 'Διάρκεια',
  'dashboard.mobile.day': 'ημέρα',
  'dashboard.mobile.days': 'ημέρες',
  'dashboard.mobile.ongoing': 'Σε εξέλιξη',
  'dashboard.mobile.startsToday': 'Ξεκινά σήμερα',
  'dashboard.mobile.tomorrow': 'Αύριο',
  'dashboard.mobile.inDays': 'Σε {count} ημέρες',
  'dashboard.mobile.inMonths': 'Σε {count} μήνες',
  'dashboard.mobile.completed': 'Ολοκληρώθηκε',
  'dashboard.mobile.currencyConverter': 'Μετατροπέας Νομισμάτων',
  'dashboard.newTripSub': 'Plan a new trip from scratch', // en-fallback
  'dashboard.filter.planned': 'Planned', // en-fallback
  'dashboard.hero.badgeLive': 'LIVE NOW', // en-fallback
  'dashboard.hero.badgeToday': 'STARTS TODAY', // en-fallback
  'dashboard.hero.badgeTomorrow': 'TOMORROW', // en-fallback
  'dashboard.hero.badgeNext': 'UP NEXT', // en-fallback
  'dashboard.hero.badgeRecent': 'RECENT', // en-fallback
  'dashboard.hero.tripDates': 'Trip dates', // en-fallback
  'dashboard.hero.noDates': 'No dates set', // en-fallback
  'dashboard.hero.travelerOne': '{count} traveler', // en-fallback
  'dashboard.hero.travelerMany': '{count} travelers', // en-fallback
  'dashboard.hero.destinationOne': '{count} destination', // en-fallback
  'dashboard.hero.destinationMany': '{count} destinations', // en-fallback
  'dashboard.hero.dayUnitOne': 'day', // en-fallback
  'dashboard.hero.dayUnitMany': 'days', // en-fallback
  'dashboard.hero.dayLeft': 'Day left', // en-fallback
  'dashboard.hero.daysLeft': 'Days left', // en-fallback
  'dashboard.hero.lastDay': 'Last day', // en-fallback
  'dashboard.hero.untilStart': 'Until start', // en-fallback
  'dashboard.hero.startsIn': 'Trip starts in', // en-fallback
  'dashboard.atlas.countriesVisited': 'Atlas · Countries visited', // en-fallback
  'dashboard.atlas.ofTotal': 'of {total}', // en-fallback
  'dashboard.atlas.tripsTotal': 'Trips total', // en-fallback
  'dashboard.atlas.placesMapped': '{count} places mapped', // en-fallback
  'dashboard.atlas.daysTraveled': 'Days traveled', // en-fallback
  'dashboard.atlas.daysUnit': 'days', // en-fallback
  'dashboard.atlas.acrossAllTrips': 'across all trips', // en-fallback
  'dashboard.atlas.distanceFlown': 'Distance flown', // en-fallback
  'dashboard.atlas.kmUnit': 'km', // en-fallback
  'dashboard.atlas.aroundEquator': '≈ {count}× around the equator', // en-fallback
  'dashboard.card.idea': 'Idea', // en-fallback
  'dashboard.card.buddyOne': 'Buddy', // en-fallback
  'dashboard.fx.from': 'From', // en-fallback
  'dashboard.fx.to': 'To', // en-fallback
  'dashboard.fx.unavailable': 'Rate unavailable', // en-fallback
  'dashboard.tz.searchPlaceholder': 'Search timezone…', // en-fallback
  'dashboard.tz.empty': 'No other timezones yet — add one with +', // en-fallback
  'dashboard.upcoming.title': 'Upcoming reservations', // en-fallback
  'dashboard.upcoming.empty': 'Nothing booked yet.', // en-fallback
  'dashboard.aria.toggleView': 'Toggle view', // en-fallback
  'dashboard.aria.filter': 'Filter', // en-fallback
  'dashboard.aria.duplicate': 'Duplicate', // en-fallback
  'dashboard.aria.refreshRates': 'Refresh rates', // en-fallback
  'dashboard.aria.swapCurrencies': 'Swap currencies', // en-fallback
  'dashboard.aria.addTimezone': 'Add timezone', // en-fallback
  'dashboard.aria.removeTimezone': 'Remove {city}', // en-fallback
  'dashboard.dayCountRequired': 'Ο αριθμός ημερών είναι υποχρεωτικός',
  'dashboard.toast.reviewersOnly': 'Reviewers only',
  'dashboard.toast.proposed': 'Trip proposed',
  'dashboard.toast.proposeError': 'Could not propose this trip',
  'dashboard.toast.editLater': 'Editing trips on the web arrives in a later phase',
  'dashboard.toast.copyLater': 'Copying trips on the web arrives in a later phase',
  'dashboard.toast.editNotYours': 'Μόνο όποιος πρότεινε το ταξίδι μπορεί να το επεξεργαστεί',
  'dashboard.toast.editPublished': 'Η επεξεργασία αποδεκτού ταξιδιού από εδώ έρχεται αργότερα',
  'dashboard.propose.stepOf': 'Step {current} of {total}',
  'dashboard.propose.continue': 'Continue',
  'dashboard.propose.submit': 'Propose trip',
  'dashboard.propose.travelers': 'Travelers',
  'dashboard.propose.addTraveler': 'Add traveler',
  'dashboard.propose.occasion': 'Occasion',
  'dashboard.propose.occasion.trip': 'Trip',
  'dashboard.propose.occasion.vacation': 'Vacation',
  'dashboard.propose.occasion.weekend': 'Weekend',
  'dashboard.propose.occasion.other': 'Other',
  'dashboard.propose.searchCountries': 'Search countries',
  'dashboard.propose.searchCities': 'Search cities',
  'dashboard.propose.makePrimary': 'Make primary',
  'dashboard.propose.primary': 'Primary',
  'dashboard.propose.countryRequired': 'Select at least one country',
  'dashboard.propose.datesRequired': 'Pick start and end dates (or a day count)',
  'dashboard.propose.notesHint': 'Anything else the family should know.',
  'dashboard.propose.none': 'None',
  'dashboard.propose.coverFileToast': 'Cover photos from your computer are not saved yet. Search Unsplash instead.',
  'dashboard.propose.missingPerson': 'Your family profile is not linked yet',
  'dashboard.propose.step.basics': 'New Trip',
  'dashboard.propose.step.countries': 'Countries',
  'dashboard.propose.step.cities': 'Cities',
  'dashboard.propose.step.notes': 'Notes',
  'dashboard.propose.step.review': 'Review',
  'dashboard.propose.reviewCover': 'Cover',
  'dashboard.propose.you': 'You',
  'dashboard.propose.hintsHeading': "You couldn't visit these before",
  'dashboard.propose.hintsCaption': 'Saved picks in these countries.',
  'dashboard.propose.hintsOverflow': 'and {n} more',
  'dashboard.proposal.title': 'Proposal',
  'dashboard.proposal.shelfTitle': 'Pending proposals',
  'dashboard.proposal.shelfVoteOpen': 'Household voting open',
  'dashboard.proposal.shelfReadyDecide': 'Ready for decision',
  'dashboard.proposal.shelfReadyYourDecide': 'Ready for your decision',
  'dashboard.proposal.decideChip': 'Decide',
  'dashboard.proposal.proposedBy': 'Proposed by {name}',
  'dashboard.proposal.status.submitted': 'Submitted',
  'dashboard.proposal.status.in_review': 'In review',
  'dashboard.proposal.yes': 'Yes',
  'dashboard.proposal.no': 'No',
  'dashboard.proposal.abstain': 'Abstain',
  'dashboard.proposal.yourVote': 'Your vote',
  'dashboard.proposal.votes': 'Votes',
  'dashboard.proposal.deciding': 'Deciding',
  'dashboard.proposal.advisory': 'Advisory',
  'dashboard.proposal.tallyEmpty': 'No deciding voters in the current audience yet.',
  'dashboard.proposal.tallyMajority': 'Deciding majority Yes reached ({yes} of {eligible} deciding eligible).',
  'dashboard.proposal.tallyNeed': 'Need {need} deciding Yes votes (eligible: {eligible}; decided: {decided}).',
  'dashboard.proposal.advisorySummary': 'Advisory: {yes} yes · {no} no · {abstain} abstain',
  'dashboard.proposal.escalate': 'Escalate audience',
  'dashboard.proposal.escalateHint': 'Add households or invite people. Existing votes stay.',
  'dashboard.proposal.households': 'Households',
  'dashboard.proposal.allHouseholdsIn': 'All households are already in the audience.',
  'dashboard.proposal.invitePeople': 'Invite people (optional)',
  'dashboard.proposal.noPeopleToInvite': 'No additional people to invite.',
  'dashboard.proposal.escalateNote': 'Note (optional)',
  'dashboard.proposal.escalateNotePlaceholder': 'Why escalate?',
  'dashboard.proposal.escalateSubmit': 'Escalate',
  'dashboard.proposal.approve': 'Approve trip',
  'dashboard.proposal.reject': 'Reject proposal',
  'dashboard.proposal.advisoryConfirmTitle': 'Approve anyway?',
  'dashboard.proposal.advisoryConfirmBody': 'Every advisory vote on this proposal is No. Approving will accept the trip despite that signal.',
  'dashboard.proposal.advisoryConfirm': 'Approve anyway',
  'dashboard.proposal.unavailable': 'Proposal unavailable',
  'dashboard.proposal.voteError': 'Could not cast your vote',
  'dashboard.proposal.decideError': 'Could not decide this proposal',
  'dashboard.proposal.escalateError': 'Could not escalate this proposal',
  'dashboard.toast.proposalAccepted': 'Trip approved',
  'dashboard.toast.proposalRejected': 'Proposal rejected',
  'dashboard.toast.statsError': "Could not load travel stats",
  'dashboard.toast.proposalsError': "Could not load pending proposals",
  'dashboard.toast.calendarLater': "Calendar subscribe arrives later",
};
export default dashboard;
