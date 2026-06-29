// Helper function to format Supabase auth errors for users
export const formatAuthError = (error) => {
  console.error('🔍 [Auth Error] Raw error:', error);

  if (!error) {
    return 'Une erreur inattendue est survenue. Veuillez réessayer.';
  }

  const message = error.message || error.msg || String(error);

  // Map Supabase error messages to user-friendly French messages
  const errorMap = {
    'Invalid login credentials': 'Identifiants incorrects. Vérifiez votre email et votre mot de passe.',
    'Email not confirmed': 'Veuillez confirmer votre email avant de vous connecter.',
    'User already registered': 'Cet email est déjà utilisé. Veuillez vous connecter.',
    'Password should be at least 6 characters': 'Le mot de passe doit contenir au moins 6 caractères.',
    'Invalid email': 'Veuillez saisir une adresse email valide.',
    'Invalid password': 'Mot de passe invalide.',
    'User not found': 'Aucun compte trouvé avec cet email.',
    'Email signups are disabled': 'Les inscriptions par email sont désactivées.',
    'OAuth error': 'Erreur lors de la connexion avec Google. Veuillez réessayer.',
    'Network error': 'Erreur de réseau. Vérifiez votre connexion internet.',
    'Missing required fields': 'Veuillez remplir tous les champs obligatoires.'
  };

  // Check for matching error messages
  for (const [key, value] of Object.entries(errorMap)) {
    if (message.toLowerCase().includes(key.toLowerCase())) {
      console.log('📝 [Auth Error] Mapped to:', value);
      return value;
    }
  }

  // Default fallback
  console.log('📝 [Auth Error] Using default message');
  return message || 'Une erreur est survenue lors de l\'authentification. Veuillez réessayer.';
};

// Log auth action with details
export const logAuthAction = (action, details = {}) => {
  const timestamp = new Date().toISOString();
  console.log(`🔐 [Auth] ${timestamp} - ${action}`, details);
};
