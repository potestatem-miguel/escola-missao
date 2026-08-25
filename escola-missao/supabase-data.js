(function () {
  function getClient() {
    const client = window.EstudaAuth?.getClient?.();
    if (!client) {
      throw new Error("Supabase não foi inicializado.");
    }
    return client;
  }

  async function getCurrentUser() {
    const user = await window.EstudaAuth.getUser();
    if (!user) {
      throw new Error("Usuário não autenticado.");
    }
    return user;
  }

  function normalizeThemes(themes) {
    return Array.isArray(themes)
      ? themes.map((theme) => String(theme || "").trim()).filter(Boolean)
      : [];
  }

  function sanitizeFileName(fileName) {
    return String(fileName || "arquivo")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9.\-_]/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase();
  }

  async function ensureProfile() {
    const client = getClient();
    const user = await getCurrentUser();
    const fullName = String(user.user_metadata?.full_name || user.email || "").trim();

    const { error } = await client
      .from("profiles")
      .upsert({
        id: user.id,
        full_name: fullName
      });

    if (error) {
      throw new Error(error.message);
    }
  }

  async function listChildren() {
    const client = getClient();
    const { data, error } = await client
      .from("children")
      .select("id, student_name, age, grade, favorite_themes, created_at")
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (data || []).map((child) => ({
      id: child.id,
      studentName: child.student_name,
      age: child.age,
      grade: child.grade,
      favoriteThemes: normalizeThemes(child.favorite_themes)
    }));
  }

  async function saveChild(child) {
    const client = getClient();
    const user = await getCurrentUser();
    const payload = {
      user_id: user.id,
      student_name: String(child.studentName || "").trim(),
      age: Number(child.age || 0),
      grade: String(child.grade || "").trim(),
      favorite_themes: normalizeThemes(child.favoriteThemes)
    };

    const { data, error } = await client
      .from("children")
      .upsert(payload, {
        onConflict: "user_id,student_name,grade"
      })
      .select("id, student_name, age, grade, favorite_themes")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return {
      id: data.id,
      studentName: data.student_name,
      age: data.age,
      grade: data.grade,
      favoriteThemes: normalizeThemes(data.favorite_themes)
    };
  }

  async function ensureChildren(children) {
    const registeredChildren = await listChildren();
    const registeredMap = new Map(registeredChildren.map((child) => [child.id, child]));
    const ensuredChildren = [];

    for (const child of children) {
      if (child.registryId && registeredMap.has(child.registryId)) {
        ensuredChildren.push(registeredMap.get(child.registryId));
        continue;
      }

      const saved = await saveChild({
        studentName: child.studentName,
        age: child.age,
        grade: child.grade,
        favoriteThemes: child.favoriteThemes || []
      });

      ensuredChildren.push(saved);
    }

    return ensuredChildren;
  }

  async function uploadFiles(files, folder) {
    const client = getClient();
    const user = await getCurrentUser();
    const fileList = Array.isArray(files) ? files : [];

    if (fileList.length === 0) {
      return [];
    }

    const uploaded = [];
    for (const file of fileList) {
      const fileName = `${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
      const path = `${user.id}/${folder}/${fileName}`;
      const { error } = await client.storage
        .from("estuda-materials")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined
        });

      if (error) {
        throw new Error(error.message);
      }

      uploaded.push({
        path,
        fileName: file.name,
        mimeType: file.type || "",
        size: file.size || 0
      });
    }

    return uploaded;
  }

  async function registerStudyContent(requestPayload, content, attachments) {
    const client = getClient();
    const user = await getCurrentUser();
    const ensuredChildren = await ensureChildren(requestPayload.children);
    const childMap = new Map(ensuredChildren.map((child) => [`${child.studentName}::${child.grade}`, child]));
    const nextChildren = [];

    for (const child of content.children) {
      const childRecord = childMap.get(`${child.studentName}::${child.grade}`);
      if (!childRecord) {
        throw new Error(`Não foi possível localizar o cadastro de ${child.studentName}.`);
      }

      const sessionPayload = {
        user_id: user.id,
        child_id: childRecord.id,
        subject: requestPayload.subject,
        topic: requestPayload.topic,
        theme: requestPayload.theme,
        goal: requestPayload.goal,
        difficulty: requestPayload.difficulty,
        question_count: Array.isArray(child.questions) ? child.questions.length : 0,
        lesson_title: content.title,
        lesson_intro: content.intro,
        lesson_sections: Array.isArray(content.lessonSections) ? content.lessonSections : [],
        attachments: Array.isArray(attachments) ? attachments : [],
        retry_of: requestPayload.retryOf || null
      };

      const { data: insertedSession, error: sessionError } = await client
        .from("study_sessions")
        .insert(sessionPayload)
        .select("id")
        .single();

      if (sessionError) {
        throw new Error(sessionError.message);
      }

      const questionsPayload = (child.questions || []).map((question, index) => ({
        session_id: insertedSession.id,
        position: index + 1,
        prompt: question.prompt,
        options: question.options || [],
        correct_index: question.correctIndex,
        explanation: question.explanation
      }));

      let insertedQuestions = [];
      if (questionsPayload.length > 0) {
        const { data, error } = await client
          .from("study_questions")
          .insert(questionsPayload)
          .select("id, position");

        if (error) {
          throw new Error(error.message);
        }

        insertedQuestions = data || [];
      }

      const questionIdMap = new Map(insertedQuestions.map((question) => [question.position, question.id]));

      nextChildren.push({
        ...child,
        id: childRecord.id,
        executionId: insertedSession.id,
        questions: (child.questions || []).map((question, index) => ({
          ...question,
          recordId: questionIdMap.get(index + 1) || null
        }))
      });
    }

    return {
      ...content,
      children: nextChildren
    };
  }

  async function saveStudyAnswers(executionId, score, percentage, answers) {
    const client = getClient();

    const { data: sessionQuestions, error: sessionQuestionsError } = await client
      .from("study_questions")
      .select("id, position")
      .eq("session_id", executionId)
      .order("position", { ascending: true });

    if (sessionQuestionsError) {
      throw new Error(sessionQuestionsError.message);
    }

    for (const question of sessionQuestions || []) {
      const answer = answers[question.position - 1] || {};
      const { error } = await client
        .from("study_questions")
        .update({
          selected_index: answer.selectedIndex,
          selected_option: answer.selectedOption || "",
          is_correct: Boolean(answer.isCorrect),
          answered_at: new Date().toISOString()
        })
        .eq("id", question.id);

      if (error) {
        throw new Error(error.message);
      }
    }

    const { error: sessionError } = await client
      .from("study_sessions")
      .update({
        answers_submitted: true,
        total_correct: score,
        accuracy: percentage,
        submitted_at: new Date().toISOString()
      })
      .eq("id", executionId);

    if (sessionError) {
      throw new Error(sessionError.message);
    }
  }

  async function listStudyExecutions() {
    const client = getClient();
    const { data, error } = await client
      .from("study_sessions")
      .select(`
        id,
        child_id,
        subject,
        topic,
        theme,
        goal,
        difficulty,
        question_count,
        total_correct,
        accuracy,
        answers_submitted,
        generated_at,
        submitted_at,
        children:child_id (
          id,
          student_name,
          age,
          grade
        ),
        study_questions (
          id,
          position,
          prompt,
          options,
          correct_index,
          explanation,
          selected_index,
          selected_option,
          is_correct
        )
      `)
      .order("generated_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data || []).map((execution) => ({
      executionId: execution.id,
      childId: execution.child_id,
      childKey: `${execution.children?.student_name || ""}::${execution.children?.grade || ""}`,
      studentName: execution.children?.student_name || "",
      age: execution.children?.age || null,
      grade: execution.children?.grade || "",
      subject: execution.subject,
      topic: execution.topic,
      theme: execution.theme,
      goal: execution.goal,
      difficulty: execution.difficulty,
      questionCount: Number(execution.question_count || 0),
      totalCorrect: execution.total_correct === null ? null : Number(execution.total_correct),
      accuracy: execution.accuracy === null ? null : Number(execution.accuracy),
      answersSubmitted: Boolean(execution.answers_submitted),
      generatedAt: execution.generated_at,
      submittedAt: execution.submitted_at,
      questions: (execution.study_questions || [])
        .sort((a, b) => a.position - b.position)
        .map((question) => ({
          id: question.id,
          index: question.position - 1,
          prompt: question.prompt,
          options: Array.isArray(question.options) ? question.options : [],
          correctIndex: question.correct_index,
          explanation: question.explanation,
          selectedIndex: question.selected_index,
          selectedOption: question.selected_option || "",
          correctOption: Array.isArray(question.options) ? (question.options[question.correct_index] || "") : "",
          isCorrect: question.is_correct
        }))
    }));
  }

  async function getDashboardSummary() {
    const [children, executions] = await Promise.all([
      listChildren(),
      listStudyExecutions()
    ]);

    return children.map((child) => {
      const childExecutions = executions.filter((execution) => execution.childId === child.id && execution.answersSubmitted);
      const totalQuestions = childExecutions.reduce((sum, execution) => sum + Number(execution.questionCount || 0), 0);
      const totalCorrect = childExecutions.reduce((sum, execution) => sum + Number(execution.totalCorrect || 0), 0);
      return {
        ...child,
        totalQuestions,
        totalCorrect
      };
    });
  }

  async function registerHomeworkSession(childId, theme, content, attachments) {
    const client = getClient();
    const user = await getCurrentUser();

    const { error } = await client
      .from("homework_sessions")
      .insert({
        user_id: user.id,
        child_id: childId,
        theme: String(theme || "").trim(),
        title: content.title,
        intro: content.intro,
        items: Array.isArray(content.items) ? content.items : [],
        attachments: Array.isArray(attachments) ? attachments : []
      });

    if (error) {
      throw new Error(error.message);
    }
  }

  window.EstudaData = {
    ensureProfile,
    listChildren,
    saveChild,
    ensureChildren,
    uploadFiles,
    registerStudyContent,
    saveStudyAnswers,
    listStudyExecutions,
    getDashboardSummary,
    registerHomeworkSession
  };
})();
