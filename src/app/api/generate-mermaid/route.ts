import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Cleans AI-generated text to extract pure Mermaid syntax
 */
function cleanMermaidCode(text: string): string {
  let cleaned = text.trim();
  
  // Remove various markdown code block formats
  // Handle ```mermaid ... ```
  cleaned = cleaned.replace(/^```mermaid\s*\n?/i, '');
  // Handle ``` ... ```
  cleaned = cleaned.replace(/^```\s*\n?/i, '');
  // Remove closing ```
  cleaned = cleaned.replace(/\n?\s*```\s*$/i, '');
  
  // Remove any leading/trailing whitespace
  cleaned = cleaned.trim();
  
  // Remove any explanatory text before the diagram
  const lines = cleaned.split('\n');
  let diagramStartIndex = 0;
  
  // Find where the actual Mermaid diagram starts
  const validStarters = [
    'graph', 'flowchart', 'sequenceDiagram', 'classDiagram',
    'stateDiagram', 'erDiagram', 'journey', 'gantt', 'pie',
    'gitGraph', 'mindmap', 'timeline', 'quadrantChart', 'C4Context'
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim().toLowerCase();
    if (validStarters.some(starter => line.startsWith(starter.toLowerCase()))) {
      diagramStartIndex = i;
      break;
    }
  }
  
  // Return only the diagram part
  return lines.slice(diagramStartIndex).join('\n').trim();
}

/**
 * Validates Mermaid syntax structure
 */
function validateMermaidSyntax(code: string): { isValid: boolean; error?: string } {
  if (!code || code.length === 0) {
    return { isValid: false, error: 'Empty diagram code' };
  }
  
  const validStarters = [
    'graph', 'flowchart', 'sequenceDiagram', 'classDiagram',
    'stateDiagram', 'erDiagram', 'journey', 'gantt', 'pie',
    'gitGraph', 'mindmap', 'timeline', 'quadrantChart', 'C4Context'
  ];
  
  const firstLine = code.split('\n')[0].trim().toLowerCase();
  const hasValidStarter = validStarters.some(starter => 
    firstLine.startsWith(starter.toLowerCase())
  );
  
  if (!hasValidStarter) {
    return { 
      isValid: false, 
      error: `Diagram must start with a valid type: ${validStarters.join(', ')}` 
    };
  }
  
  // Check for basic structure (at least 2 lines for meaningful diagram)
  const lines = code.split('\n').filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    return { 
      isValid: false, 
      error: 'Diagram appears incomplete (too few lines)' 
    };
  }
  
  return { isValid: true };
}

/**
 * Creates a fallback diagram when generation fails
 */
function createFallbackDiagram(prompt: string): string {
  // Escape special characters in prompt for safe display
  const safePrompt = prompt.replace(/"/g, '\\"').substring(0, 50);
  
  return `flowchart TD
    A["Request: ${safePrompt}"] --> B["Unable to generate diagram"]
    B --> C["Please try:"]
    C --> D["1. Simplify your request"]
    C --> E["2. Be more specific"]
    C --> F["3. Use different keywords"]
    
    style B fill:#ffcccc
    style C fill:#ffffcc`;
}

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Valid prompt string is required' },
        { status: 400 }
      );
    }

    if (prompt.length > 1000) {
      return NextResponse.json(
        { error: 'Prompt too long (max 1000 characters)' },
        { status: 400 }
      );
    }

    // Generate Mermaid diagram using AI
    const { text } = await generateText({
      model: google('gemini-2.0-flash-exp'),
      system: `You are an expert in creating Mermaid diagrams. Follow these rules strictly:

1. Analyze the user's requirements carefully
2. Choose the most appropriate Mermaid diagram type (flowchart, sequenceDiagram, classDiagram, gantt, erDiagram, etc.)
3. Generate ONLY valid Mermaid syntax code, nothing else

4. CRITICAL SYNTAX RULE FOR SEQUENCE DIAGRAMS:
   ANY participant name containing parentheses (), commas, spaces, or special characters MUST be wrapped in double quotes.
   
   CORRECT examples:
   participant "Education (Courses, Books, Videos)"
   participant "Tools (Python, Libraries)"
   participant "User Service"
   participant "Payment Gateway (Stripe)"
   
   WRONG examples (NEVER do this):
   participant Education (Courses, Books, Videos)
   participant Tools (Python, Libraries)
   participant User Service
   
   If the name has NO special characters, quotes are optional:
   participant User
   participant System
   participant Database

5. Use proper indentation and formatting
6. Include meaningful labels and descriptions
7. Make the diagram comprehensive but not overly complex
8. Ensure all syntax follows Mermaid.js specifications exactly

CRITICAL RULES:
- Return ONLY the Mermaid code
- NO explanations before or after
- NO markdown code blocks (no \`\`\`)
- NO additional text or comments outside the diagram
- Start directly with the diagram type (e.g., "flowchart TD" or "sequenceDiagram")
- ALWAYS wrap participant names with parentheses or commas in double quotes`,
      prompt: `Create a Mermaid diagram for: ${prompt}`,
      temperature: 0.7,
      maxOutputTokens: 2000,
    });

    // Clean up the AI response
    let mermaidCode = cleanMermaidCode(text);

    // Validate the generated syntax
    const validation = validateMermaidSyntax(mermaidCode);

    if (!validation.isValid) {
      console.warn('Generated invalid Mermaid syntax:', validation.error);
      console.warn('Generated code:', mermaidCode);
      
      // Use fallback diagram
      mermaidCode = createFallbackDiagram(prompt);
      
      return NextResponse.json({
        mermaidCode,
        success: true,
        warning: 'Generated diagram was invalid, using fallback',
        validationError: validation.error,
      });
    }

    return NextResponse.json({
      mermaidCode,
      success: true,
      generated: true,
    });

  } catch (error) {
    console.error('Error generating Mermaid diagram:', error);
    
    // Provide more detailed error information
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return NextResponse.json(
      { 
        error: 'Failed to generate diagram',
        details: errorMessage,
        ...(process.env.NODE_ENV === 'development' && { stack: errorStack }),
      },
      { status: 500 }
    );
  }
}
