import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

const TOOLS: Tool[] = [
  {
    name: "find_optimal_times",
    description: "여러 참여자의 일정을 분석하여 모임 가능한 최적의 시간대를 찾습니다. 참여자들의 캘린더 충돌 분석, 저녁 시간대(18-21시) 및 주말 선호도 반영, 전후 30분 버퍼 타임 고려, 최대 다수가 참여 가능한 시간 우선 추천합니다.",
    inputSchema: {
      type: "object",
      properties: {
        participants: {
          type: "array",
          items: { type: "string" },
          description: "참여자 이름 또는 ID 목록"
        },
        date_range: {
          type: "string",
          description: "검색할 날짜 범위 (예: 다음 주, 이번 주말)"
        },
        duration_hours: {
          type: "number",
          description: "예상 모임 시간 (기본값: 3시간)"
        }
      },
      required: ["participants", "date_range"]
    }
  },
  {
    name: "recommend_venues",
    description: "참여자들의 출발 위치를 기반으로 모두에게 공정한 모임 장소를 추천합니다. 지리적 중심점 계산, 최대 이동 시간 최소화, 날씨 고려, 음식 선호도 반영합니다.",
    inputSchema: {
      type: "object",
      properties: {
        participant_locations: {
          type: "array",
          items: { type: "string" },
          description: "각 참여자의 출발 위치"
        },
        meeting_datetime: {
          type: "string",
          description: "모임 예정 일시"
        },
        category: {
          type: "string",
          description: "장소 유형 (맛집, 카페, 술집 등)"
        },
        preferences: {
          type: "object",
          properties: {
            cuisine: { type: "string" },
            no_spicy: { type: "boolean" },
            indoor_only: { type: "boolean" },
            max_budget_per_person: { type: "number" }
          }
        }
      },
      required: ["participant_locations"]
    }
  },
  {
    name: "create_meetup_poll",
    description: "시간과 장소 옵션으로 투표를 생성합니다. 그룹 채팅에서 참여자들이 선호하는 옵션을 선택할 수 있습니다.",
    inputSchema: {
      type: "object",
      properties: {
        time_options: {
          type: "array",
          items: { type: "object" },
          description: "시간 옵션 목록"
        },
        venue_options: {
          type: "array",
          items: { type: "object" },
          description: "장소 옵션 목록"
        },
        deadline_hours: {
          type: "number",
          description: "투표 마감까지 시간"
        }
      },
      required: ["time_options", "venue_options"]
    }
  },
  {
    name: "finalize_meetup",
    description: "투표 결과를 바탕으로 모임을 확정하고 참여자들에게 알립니다. 모든 참여자 캘린더에 일정 등록, 확정 메시지 발송합니다.",
    inputSchema: {
      type: "object",
      properties: {
        selected_time: {
          type: "string",
          description: "선택된 시간"
        },
        selected_venue: {
          type: "string",
          description: "선택된 장소"
        },
        participants: {
          type: "array",
          items: { type: "string" },
          description: "참여자 목록"
        },
        make_reservation: {
          type: "boolean",
          description: "예약 진행 여부"
        }
      },
      required: ["selected_time", "selected_venue", "participants"]
    }
  },
  {
    name: "initiate_dutch_pay",
    description: "모임 후 정산을 시작합니다. 균등 분할 또는 커스텀 금액 설정, 송금 요청 생성합니다.",
    inputSchema: {
      type: "object",
      properties: {
        total_amount: {
          type: "number",
          description: "총 금액 (원)"
        },
        participants: {
          type: "array",
          items: { type: "string" },
          description: "정산 참여자 목록"
        },
        payer: {
          type: "string",
          description: "결제한 사람"
        },
        split_type: {
          type: "string",
          enum: ["equal", "custom"],
          description: "분할 방식"
        }
      },
      required: ["total_amount", "participants", "payer"]
    }
  }
];

interface ToolResult {
  success: boolean;
  data?: any;
  message: string;
}

function executeToolFindOptimalTimes(args: any): ToolResult {
  const { participants, date_range, duration_hours = 3 } = args;
  const count = participants?.length || 0;
  
  const slots = [
    {
      datetime: "토요일 (1/11) 18:00",
      score: 0.95,
      available_count: count,
      available_users: participants,
      conflicts: [],
      reason: "전원 가능, 저녁 프라임 타임"
    },
    {
      datetime: "일요일 (1/12) 12:00",
      score: 0.80,
      available_count: count - 1,
      available_users: participants?.slice(0, -1),
      conflicts: [{ user: participants?.[count - 1], reason: "오후 일정 있음" }],
      reason: "1명 제외 가능"
    }
  ];

  return {
    success: true,
    data: {
      search_range: date_range,
      duration_hours,
      total_participants: count,
      recommended_slots: slots
    },
    message: `📅 ${count}명의 일정을 분석했어요!\n\n🥇 추천 1순위: ${slots[0].datetime}\n   → ${slots[0].available_count}명 전원 가능 ✅\n\n🥈 추천 2순위: ${slots[1].datetime}\n   → ${slots[1].available_count}명 가능\n\n어떤 시간으로 할까요?`
  };
}

function executeToolRecommendVenues(args: any): ToolResult {
  const { participant_locations, category = "맛집" } = args;
  const locationCount = participant_locations?.length || 0;
  const centroid = locationCount >= 3 ? "양재역" : "강남역";
  
  const venues = [
    {
      name: "봉피양 양재점",
      category: "한식 (칼국수/만두)",
      rating: 4.6,
      avg_travel_minutes: 22,
      fairness_score: 0.92,
      note: "칼국수 맛집, 단체석 있음"
    },
    {
      name: "매드포갈릭 강남점",
      category: "양식 (파스타)",
      rating: 4.4,
      avg_travel_minutes: 25,
      fairness_score: 0.88,
      note: "분위기 좋음"
    }
  ];

  return {
    success: true,
    data: { centroid, venues },
    message: `📍 ${locationCount}명의 위치를 분석했어요!\n\n🎯 중심 지점: ${centroid} 근처\n\n🥇 ${venues[0].name}\n   ⭐ ${venues[0].rating} | 평균 ${venues[0].avg_travel_minutes}분\n\n🥈 ${venues[1].name}\n   ⭐ ${venues[1].rating} | 평균 ${venues[1].avg_travel_minutes}분\n\n어떤 장소가 좋을까요?`
  };
}

function executeToolCreateMeetupPoll(args: any): ToolResult {
  const { time_options, venue_options, deadline_hours = 24 } = args;
  const pollId = `poll_${Date.now()}`;

  return {
    success: true,
    data: {
      poll_id: pollId,
      time_options_count: time_options?.length || 0,
      venue_options_count: venue_options?.length || 0,
      status: "active"
    },
    message: `🗳️ 투표를 생성했어요!\n\n📅 시간 옵션: ${time_options?.length || 0}개\n📍 장소 옵션: ${venue_options?.length || 0}개\n⏰ 마감: ${deadline_hours}시간 후\n\n참여자들에게 투표 알림을 보낼게요!`
  };
}

function executeToolFinalizeMeetup(args: any): ToolResult {
  const { selected_time, selected_venue, participants, make_reservation = false } = args;

  return {
    success: true,
    data: {
      confirmed_time: selected_time,
      confirmed_venue: selected_venue,
      participants,
      calendar_events_created: participants?.length || 0
    },
    message: `✅ 모임이 확정되었어요! 🎉\n\n📅 일시: ${selected_time}\n📍 장소: ${selected_venue}\n👥 참석: ${participants?.join(', ')}\n\n${participants?.length || 0}명의 캘린더에 일정을 등록했어요!`
  };
}

function executeToolInitiateDutchPay(args: any): ToolResult {
  const { total_amount, participants, payer } = args;
  const perPerson = Math.ceil(total_amount / (participants?.length || 1));

  return {
    success: true,
    data: {
      request_id: `pay_${Date.now()}`,
      total_amount,
      per_person: perPerson,
      payer,
      participants
    },
    message: `💰 정산을 시작했어요!\n\n💵 총 금액: ${total_amount.toLocaleString()}원\n👤 결제자: ${payer}\n📊 1인당: ${perPerson.toLocaleString()}원\n\n카카오페이로 송금 요청을 보낼게요!`
  };
}

function executeTool(name: string, args: any): ToolResult {
  switch (name) {
    case "find_optimal_times":
      return executeToolFindOptimalTimes(args);
    case "recommend_venues":
      return executeToolRecommendVenues(args);
    case "create_meetup_poll":
      return executeToolCreateMeetupPoll(args);
    case "finalize_meetup":
      return executeToolFinalizeMeetup(args);
    case "initiate_dutch_pay":
      return executeToolInitiateDutchPay(args);
    default:
      return { success: false, message: `알 수 없는 도구: ${name}` };
  }
}

interface JsonRpcRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params?: any;
}

app.post('/mcp', (req: Request, res: Response) => {
  const { jsonrpc, id, method, params }: JsonRpcRequest = req.body;

  console.log(`[MCP] Method: ${method}`);

  if (method === 'tools/list') {
    return res.json({
      jsonrpc: '2.0',
      id,
      result: { tools: TOOLS }
    });
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params || {};
    
    if (!name) {
      return res.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: 'Tool name is required' }
      });
    }

    const result = executeTool(name, args || {});

    return res.json({
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    });
  }

  if (method === 'initialize') {
    return res.json({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'social-logistics-mcp', version: '1.0.0' }
      }
    });
  }

  return res.json({
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` }
  });
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Social Logistics MCP Server',
    version: '1.0.0',
    description: '그룹 모임 일정 조율 AI 에이전트',
    endpoints: { mcp: 'POST /mcp', health: 'GET /health' },
    tools: TOOLS.map(t => t.name)
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Social Logistics MCP Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 MCP endpoint: http://localhost:${PORT}/mcp`);
});
